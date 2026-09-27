import { parseExactHttpUrl } from '@carry/protocol'
export const DEFAULT_CARRY_ORIGIN='https://carry-hhc6.onrender.com'
export function captureAddress(tab:{url?:string;title?:string},origin=DEFAULT_CARRY_ORIGIN):string {
  const target=new URL(origin)
  if(target.origin!==origin||(target.protocol!=='https:'&&!(target.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(target.hostname))))throw new Error('Carry needs an HTTPS origin (loopback is allowed for development).')
  // Restricted tabs may not expose a URL. Open the usable editor with a clear error.
  if(!tab.url||!parseExactHttpUrl(tab.url))return origin+'/#capture='+encodeURIComponent(JSON.stringify({url:''}))
  return origin+'/#capture='+encodeURIComponent(JSON.stringify({url:tab.url,title:(tab.title??'').slice(0,1024)}))
}
