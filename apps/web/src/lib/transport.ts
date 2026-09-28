import { sign } from '@carry/crypto'
import { z } from '@carry/protocol/secure'
import { getIdentity } from './device'

export class ApiError extends Error {
  status:number
  constructor(status:number,message:string) {super(message);this.status=status}
}
async function request(path:string,method:string,body:unknown,token?:string,timeoutMs=10000) {
  let response:Response
  try {
    response=await fetch('/api/v1'+path,{
      method,headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)}),cache:'no-store',signal:AbortSignal.timeout(timeoutMs),
    })
  } catch {throw new ApiError(0,'The relay could not be reached. Your saved send can be retried.')}
  if (!response.ok) {
    const error=await response.json().catch(()=>null) as {error?:string}|null
    throw new ApiError(response.status,error?.error ?? 'The relay could not complete this request.')
  }
  return response.json() as Promise<unknown>
}
let session:Promise<string>|undefined
async function authenticate() {
  const identity=await getIdentity()
  await request('/devices','POST',{bundle:identity.public})
  const challenge=z.object({id:z.string(),nonce:z.string(),expiresAt:z.number()}).parse(await request('/auth/challenge','POST',{deviceId:identity.public.id}))
  const signature=await sign(identity,JSON.stringify(['carry.auth.v1',location.origin,identity.public.id,challenge.id,challenge.nonce,challenge.expiresAt]))
  return z.object({token:z.string()}).parse(await request('/auth/session','POST',{deviceId:identity.public.id,challengeId:challenge.id,signature})).token
}
async function token() {
  session ??= authenticate().catch(error=>{session=undefined;throw error})
  return session
}
export async function api(path:string,method='GET',body?:unknown,timeoutMs=10000):Promise<unknown> {
  try {return await request(path,method,body,await token(),timeoutMs)}
  catch(error) {
    if (!(error instanceof ApiError) || error.status!==401) throw error
    session=undefined
    return request(path,method,body,await token(),timeoutMs)
  }
}
