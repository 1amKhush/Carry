import { MAX_EXCERPT_LENGTH, parseExactHttpUrl } from '@carry/protocol'
export const DEFAULT_CARRY_ORIGIN='https://carry-hhc6.onrender.com'
export function captureAddress(tab:{url?:string;title?:string},origin=DEFAULT_CARRY_ORIGIN,excerpt?:string):string {
  const target=new URL(origin)
  if(target.origin!==origin||(target.protocol!=='https:'&&!(target.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(target.hostname))))throw new Error('Carry needs an HTTPS origin (loopback is allowed for development).')
  // Restricted tabs may not expose a URL. Open the usable editor with a clear error.
  if(!tab.url||!parseExactHttpUrl(tab.url))return origin+'/#capture='+encodeURIComponent(JSON.stringify({url:''}))
  return origin+'/#capture='+encodeURIComponent(JSON.stringify({url:tab.url,title:(tab.title??'').slice(0,1024),...(excerpt!==undefined?{excerpt}: {})}))
}

// The context-menu API supplies only the user-selected text. Editable elements
// are refused so form contents and passwords never enter the draft payload.
export function selectedTextAddress(info:{editable:boolean;selectionText?:string},tab:{url?:string;title?:string},origin=DEFAULT_CARRY_ORIGIN):string {
  if(info.editable||!info.selectionText?.trim()) {
    const base=new URL(captureAddress(tab,origin))
    base.hash='capture-error='+(info.editable?'selection-editable':'selection-empty')
    return base.href
  }
  return captureAddress(tab,origin,info.selectionText.trim().slice(0,MAX_EXCERPT_LENGTH+1))
}
