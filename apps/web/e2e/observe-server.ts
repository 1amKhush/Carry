// Test process only: count share requests at the HTTP boundary without reading bodies.
import { subscribe } from 'node:diagnostics_channel'
import { appendFileSync } from 'node:fs'
subscribe('http.server.request.start',message=>{
  const {request}=message as {request:{method?:string;url?:string}}
  if(request.method==='POST'&&request.url?.split('?')[0]==='/share-target'&&process.env.CARRY_E2E_SHARE_COUNTER)appendFileSync(process.env.CARRY_E2E_SHARE_COUNTER,'1')
})
