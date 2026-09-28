import assert from 'node:assert/strict'
import test from 'node:test'
import { generateIdentity, encryptCard } from '@carry/crypto'
import { mkdtempSync,readFileSync,rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildResumeInput } from '@carry/protocol/resume-ai'
import { createApp } from '../src/app.ts'
import { SqliteDatabase } from '../src/store/local.ts'
import { authenticate, pair, origin } from './helpers.ts'

const content=()=>({id:crypto.randomUUID(),title:'Private task',primaryUrl:'https://example.com/private?x=1#step',relatedUrls:[],note:'Check state',goal:'Fix callback',nextAction:'Reproduce Safari bug',excerpt:'Cookie missing',createdAt:new Date().toISOString()})
const plan={whereYouLeftOff:'You were fixing a callback.',doNext:['Check the cookie.'],usefulLinks:[],insufficientContext:false}

test('shared free key stays server-side; authenticated recipient gets bounded free-model rotation',async t=>{
  const models:string[]=[]
  const seenBodies:string[]=[]
  let first=true
  const upstream:typeof fetch=async(input,init)=>{
    const url=String(input)
    assert.equal(init?.headers&&'Authorization' in init.headers?(init.headers as Record<string,string>).Authorization:undefined,'Bearer sk-or-test-server-only')
    if(url.endsWith('/models'))return Response.json({data:[{id:'paid/expensive',pricing:{prompt:'1',completion:'1'}},{id:'vendor/first:free',pricing:{prompt:'0',completion:'0'}},{id:'vendor/second:free',pricing:{prompt:'0',completion:'0'}}]})
    const body=JSON.parse(String(init?.body));models.push(body.model);seenBodies.push(String(init?.body))
    if(first&&body.model==='openrouter/free')return new Response('',{status:429})
    if(first&&body.model==='vendor/first:free')return new Response('',{status:503})
    first=false
    return Response.json({choices:[{message:{content:JSON.stringify(plan)}}]})
  }
  const database=new SqliteDatabase(':memory:')
  const app=createApp({origin,rateLimit:false,database,freeAiKey:'sk-or-test-server-only',freeAiFetch:upstream})
  t.after(()=>app.close())
  const sender=await generateIdentity(),recipient=await generateIdentity(),stranger=await generateIdentity()
  const sh=await authenticate(app,sender),rh=await authenticate(app,recipient),oh=await authenticate(app,stranger)
  const paired=await pair(app,sender,recipient,sh,rh),card=content(),envelope=await encryptCard(sender,recipient.public,paired.id,card)
  assert.equal((await app.inject({method:'POST',url:'/api/v1/envelopes',headers:sh,payload:envelope})).statusCode,201)
  const payload={cardId:card.id,input:buildResumeInput(card)}
  assert.equal((await app.inject({url:'/api/v1/ai/free/status'})).statusCode,401)
  assert.equal((await app.inject({url:'/api/v1/ai/free/status',headers:rh})).json().enabled,true)
  for(const headers of [undefined,sh,oh])assert.notEqual((await app.inject({method:'POST',url:'/api/v1/ai/free',headers,payload})).statusCode,200)
  assert.equal((await app.inject({method:'POST',url:'/api/v1/ai/free',headers:rh,payload:{...payload,input:{...payload.input,extra:'secret'}}})).statusCode,400)
  assert.deepEqual(models,[])
  const result=await app.inject({method:'POST',url:'/api/v1/ai/free',headers:rh,payload})
  assert.equal(result.statusCode,200,result.body)
  assert.equal(result.json().model,'vendor/second:free')
  assert.equal(result.json().content,JSON.stringify(plan))
  assert.deepEqual(models,['openrouter/free','vendor/first:free','vendor/second:free'])
  assert.ok(seenBodies.every(body=>body.includes('Fix callback')))
  assert.ok(seenBodies.every(body=>!body.includes('sk-or-test-server-only')))
  for(let i=0;i<4;i++)assert.equal((await app.inject({method:'POST',url:'/api/v1/ai/free',headers:rh,payload})).statusCode,200)
  assert.equal((await app.inject({method:'POST',url:'/api/v1/ai/free',headers:rh,payload})).statusCode,429)
  assert.equal(Number((await app.inject({url:'/api/v1/ai/free/status',headers:rh})).json().perDeviceDailyLimit),5)
  const stored=JSON.stringify([await database.all('SELECT * FROM free_ai_usage'),await database.all('SELECT * FROM envelopes')])
  for(const secret of ['Fix callback','Private task','sk-or-test-server-only'])assert.equal(stored.includes(secret),false)
})

test('free assistance fails closed without a server key',async t=>{
  const app=createApp({origin,rateLimit:false})
  t.after(()=>app.close())
  const identity=await generateIdentity(),headers=await authenticate(app,identity)
  assert.equal((await app.inject({url:'/api/v1/ai/free/status',headers})).json().enabled,false)
  const response=await app.inject({method:'POST',url:'/api/v1/ai/free',headers,payload:{cardId:crypto.randomUUID(),input:buildResumeInput(content())}})
  assert.equal(response.statusCode,503)
  assert.match(response.json().error,/not configured/)
})

test('free daily allowance survives an API restart without storing card text',async t=>{
  const directory=mkdtempSync(join(tmpdir(),'carry-free-ai-')),databasePath=join(directory,'carry.sqlite')
  const upstream:typeof fetch=async()=>Response.json({choices:[{message:{content:JSON.stringify(plan)}}]})
  let app=createApp({origin,rateLimit:false,databasePath,freeAiKey:'sk-or-test-server-only',freeAiFetch:upstream})
  t.after(async()=>{await app.close();rmSync(directory,{recursive:true,force:true})})
  const sender=await generateIdentity(),recipient=await generateIdentity()
  const sh=await authenticate(app,sender),rh=await authenticate(app,recipient),paired=await pair(app,sender,recipient,sh,rh)
  const card=content(),envelope=await encryptCard(sender,recipient.public,paired.id,card)
  await app.inject({method:'POST',url:'/api/v1/envelopes',headers:sh,payload:envelope})
  const payload={cardId:card.id,input:buildResumeInput(card)}
  for(let i=0;i<5;i++)assert.equal((await app.inject({method:'POST',url:'/api/v1/ai/free',headers:rh,payload})).statusCode,200)
  await app.close()
  const disk=readFileSync(databasePath).toString('utf8')
  for(const secret of [card.title,card.goal,card.nextAction,card.note,card.primaryUrl,'sk-or-test-server-only'])assert.equal(disk.includes(secret),false)
  app=createApp({origin,rateLimit:false,databasePath,freeAiKey:'sk-or-test-server-only',freeAiFetch:upstream})
  assert.equal((await app.inject({method:'POST',url:'/api/v1/ai/free',headers:rh,payload})).statusCode,429)
})
