import type { FastifyInstance, FastifyRequest } from 'fastify'
import { resumeInputSchema, resumeRequestBody, type ResumeInput } from '@carry/protocol/resume-ai'
import { jsonSchema, uuidSchema, z } from '@carry/protocol/secure'
import { RelayError, type RelayStore } from '../store/sqlite.ts'

const UPSTREAM='https://openrouter.ai/api/v1'
const RETRYABLE=new Set([408,429,500,502,503,504])
const PER_DEVICE_DAILY=5
const GLOBAL_DAILY=50
const SAFE_FREE_MODEL=/^[A-Za-z0-9._:-]+\/[A-Za-z0-9._:-]+:free$/
const excluded=new Set(['nvidia/nemotron-3.5-content-safety:free'])

export function registerFreeAssistance(app:FastifyInstance,store:RelayStore,authenticate:(request:FastifyRequest)=>Promise<string>,now:()=>number,key?:string,upstream:typeof fetch=fetch) {
  let cached:string[]=[]
  let refreshedAt=0
  let cursor=0
  let loading:Promise<string[]>|undefined
  async function freeModels():Promise<string[]> {
    if(cached.length&&now()-refreshedAt<600_000)return cached
    loading??=(async()=>{
      try {
        const response=await upstream(UPSTREAM+'/models',{headers:{Authorization:'Bearer '+key},signal:AbortSignal.timeout(5000),redirect:'error'})
        if(!response.ok)throw new Error('Catalog unavailable')
        const raw=await response.text()
        if(raw.length>4_000_000)throw new Error('Catalog too large')
        const data:unknown=JSON.parse(raw)
        const entries=(data as {data?:unknown})?.data
        if(!Array.isArray(entries))throw new Error('Invalid catalog')
        const models=[...new Set(entries.flatMap((entry:unknown)=>{
          if(!entry||typeof entry!=='object')return []
          const item=entry as {id?:unknown;pricing?:{prompt?:unknown;completion?:unknown}}
          if(typeof item.id!=='string'||!SAFE_FREE_MODEL.test(item.id)||excluded.has(item.id))return []
          if(item.pricing&&(Number(item.pricing.prompt)!==0||Number(item.pricing.completion)!==0))return []
          return [item.id]
        }))]
        if(!models.length)throw new Error('No compatible free models')
        cached=models;refreshedAt=now()
        return models
      } catch {return []}
      finally {loading=undefined}
    })()
    return loading
  }
  async function generate(input:ResumeInput,model:string):Promise<{status:number;content?:string}> {
    try {
      const response=await upstream(UPSTREAM+'/chat/completions',{
        method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
        body:JSON.stringify(resumeRequestBody(input,model)),signal:AbortSignal.timeout(20_000),redirect:'error',
      })
      if(!response.ok)return {status:response.status}
      const raw=await response.text()
      if(raw.length>64_000)return {status:502}
      const result:unknown=JSON.parse(raw)
      const content=(result as {choices?:{message?:{content?:unknown}}[]})?.choices?.[0]?.message?.content
      return typeof content==='string'&&content.length<=12_000?{status:200,content}:{status:502}
    } catch {return {status:503}}
  }
  app.get('/api/v1/ai/free/status',async request=>{
    await authenticate(request)
    return {enabled:Boolean(key),perDeviceDailyLimit:PER_DEVICE_DAILY}
  })
  app.post<{Body:{cardId:string;input:ResumeInput}}>('/api/v1/ai/free',{
    schema:{body:jsonSchema(z.strictObject({cardId:uuidSchema,input:resumeInputSchema}))},
    config:{rateLimit:{max:6,timeWindow:'1 minute'}},
  },async request=>{
    const member=await authenticate(request)
    if(!key)throw new RelayError(503,'Free assistance is not configured on this deployment.')
    const card=await store.db.get('SELECT e.id FROM envelopes e JOIN pairs p ON p.id=e.pair_id AND p.revoked=0 WHERE e.id=? AND e.recipient=? AND e.expires_at>?',request.body.cardId,member,now())
    if(!card)throw new RelayError(404,'Card unavailable for this device.')
    const day=Math.floor(now()/86400000)
    await store.transaction(async tx=>{
      const own=Number((await tx.get('SELECT requests FROM free_ai_usage WHERE day=? AND device_id=?',day,member))?.requests??0)
      const total=Number((await tx.get('SELECT requests FROM free_ai_usage WHERE day=? AND device_id=?',day,'*'))?.requests??0)
      if(own>=PER_DEVICE_DAILY||total>=GLOBAL_DAILY)throw new RelayError(429,'Free assistance limit reached. Try again tomorrow or use your own key.')
      for(const id of [member,'*'])await tx.run('INSERT INTO free_ai_usage(day,device_id,requests) VALUES (?,?,1) ON CONFLICT(day,device_id) DO UPDATE SET requests=requests+1',day,id)
    })
    const first=await generate(request.body.input,'openrouter/free')
    if(first.status===200)return {content:first.content,model:'openrouter/free'}
    if(first.status===402)throw new RelayError(503,'Free assistance has no available credits.')
    if(first.status===401||first.status===403)throw new RelayError(503,'Free assistance is unavailable on this deployment.')
    if(!RETRYABLE.has(first.status))throw new RelayError(502,'Free model could not produce a plan.')
    const models=await freeModels()
    for(let attempt=0;attempt<Math.min(2,models.length);attempt++) {
      const model=models[cursor++%models.length]
      const result=await generate(request.body.input,model)
      if(result.status===200)return {content:result.content,model}
      if(result.status===402)throw new RelayError(503,'Free assistance has no available credits.')
      if(result.status===401||result.status===403)throw new RelayError(503,'Free assistance is unavailable on this deployment.')
      if(!RETRYABLE.has(result.status))break
    }
    throw new RelayError(429,'Free models are busy. Try again later or use your own key.')
  })
}
