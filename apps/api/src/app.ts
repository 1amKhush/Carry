import Fastify from 'fastify'
import rateLimit from '@fastify/rate-limit'
import staticFiles from '@fastify/static'
import { fileURLToPath } from 'node:url'
import { RelayError, RelayStore } from './store/sqlite.ts'
import type { RelayDatabase } from './store/database.ts'
import { registerSecure } from './routes/secure.ts'

export function createApp(options:{databasePath?:string;database?:RelayDatabase;origin?:string;now?:()=>number;serveWeb?:boolean;webRoot?:string;rateLimit?:boolean;automaticCleanup?:boolean;freeAiKey?:string;freeAiFetch?:typeof fetch}={}) {
  const origin=options.origin??'http://127.0.0.1:5173'
  const url=new URL(origin)
  if(url.origin!==origin||(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))))throw new Error('CARRY_ORIGIN must be an HTTPS origin (HTTP is allowed only on loopback).')
  const now=options.now??Date.now
  const store=new RelayStore(options.database??options.databasePath??':memory:')
  const app=Fastify({logger:false,bodyLimit:64*1024,ajv:{customOptions:{coerceTypes:false,removeAdditional:false,useDefaults:false}}})
  let lastCleanup=-Infinity
  let cleaning:Promise<void>|undefined
  let interval:ReturnType<typeof setInterval>|undefined
  function cleanup() {
    if(options.automaticCleanup===false)return Promise.resolve()
    if(cleaning)return cleaning
    if(now()-lastCleanup<60_000)return Promise.resolve()
    cleaning=store.cleanup(now()).then(()=>{lastCleanup=now()}).finally(()=>{cleaning=undefined})
    return cleaning
  }
  app.addHook('onReady',async()=>{
    await store.initialize()
    await cleanup()
    if(options.automaticCleanup!==false) {
      interval=setInterval(()=>{void cleanup().catch(()=>{console.error('Carry expiry cleanup failed; it will retry.')})},60_000)
      interval.unref()
    }
  })
  if(options.rateLimit!==false)app.register(rateLimit,{max:300,timeWindow:'1 minute'})
  app.addHook('onRequest',async(req,reply)=>{
    reply.header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').header('Referrer-Policy','no-referrer')
    if(options.serveWeb)reply.header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://openrouter.ai; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
    // A missing share worker must never pass plaintext into API/body parsing.
    // The network may still have carried this POST: surface the failure in the editor.
    if(req.method==='POST'&&req.url.split('?')[0]==='/share-target')return reply.code(303).header('Location','/#capture-error=share-unavailable').send()
    if(req.headers.origin&&req.headers.origin!==origin)throw new RelayError(403,'Origin not allowed.')
    if(req.url.startsWith('/api/'))await cleanup()
  })
  app.setErrorHandler((error,_req,reply)=>{
    const status=error instanceof RelayError?error.statusCode:(error instanceof Error&&'statusCode' in error&&typeof error.statusCode==='number'?error.statusCode:500)
    reply.code(status).send({error:error instanceof RelayError?error.message:status===400?'Invalid request.':status===429?'Too many requests. Try again shortly.':'Request failed.'})
  })
  registerSecure(app,store,origin,now,options.freeAiKey,options.freeAiFetch)
  if(options.serveWeb)app.register(staticFiles,{root:options.webRoot??fileURLToPath(new URL('../../web/dist',import.meta.url)),index:'index.html'})
  app.setNotFoundHandler((req,reply)=>{
    const path=req.url.split('?')[0]
    const apiPath=path==='/api'||path.startsWith('/api/')
    if(options.serveWeb&&!apiPath&&(req.method==='GET'||req.method==='HEAD')&&req.headers.accept?.includes('text/html')&&!path.startsWith('/assets/')&&!path.split('/').at(-1)?.includes('.'))return reply.sendFile('index.html')
    return reply.code(404).send({error:'Not found.'})
  })
  app.addHook('onClose',async()=>{
    if(interval)clearInterval(interval)
    await cleaning?.catch(()=>{})
    await store.close()
  })
  return app
}
