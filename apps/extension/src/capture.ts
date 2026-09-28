import { MAX_EXCERPT_LENGTH, parseExactHttpUrl } from '@carry/protocol'
export const DEFAULT_CARRY_ORIGIN='https://carry-hhc6.onrender.com'
export function captureAddress(tab:{url?:string;title?:string},origin=DEFAULT_CARRY_ORIGIN,excerpt?:string,selectionLinkUnavailable=false):string {
  const target=new URL(origin)
  if(target.origin!==origin||(target.protocol!=='https:'&&!(target.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(target.hostname))))throw new Error('Carry needs an HTTPS origin (loopback is allowed for development).')
  // Restricted tabs may not expose a URL. Open the usable editor with a clear error.
  if(!tab.url||!parseExactHttpUrl(tab.url))return origin+'/#capture='+encodeURIComponent(JSON.stringify({url:''}))
  return origin+'/#capture='+encodeURIComponent(JSON.stringify({url:tab.url,title:(tab.title??'').slice(0,1024),...(excerpt!==undefined?{excerpt}: {}),...(selectionLinkUnavailable?{selectionLinkUnavailable:true}:{})}))
}

// Text fragments use only the explicit selection. Keep the source URL's query
// and ordinary hash bytes; replace an older text directive with the new target.
export function selectedTextUrl(url:string,selection:string):string|null {
  const exact=parseExactHttpUrl(url)
  if(!exact)return null
  const text=selection.trim().replace(/\s+/g,' ')
  if(!text)return null
  try {
    const encode=(value:string)=>encodeURIComponent(value).replace(/[!'()*-]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase())
    const start=text.slice(0,100).replace(/\s+\S*$/,'').trim()||text.slice(0,80)
    const end=text.slice(-100).replace(/^\S*\s+/,'').trim()||text.slice(-80)
    const target=text.length<=160?encode(text):encode(start)+','+encode(end)
    const hash=exact.indexOf('#')
    const base=hash<0?exact+'#':exact.slice(0,hash+1)+exact.slice(hash+1).split(':~:')[0]
    return parseExactHttpUrl(base+':~:text='+target)
  } catch {return null}
}

// The context-menu API supplies only the user-selected text. Editable elements
// are refused so form contents and passwords never enter the draft payload.
export function selectedTextAddress(info:{editable:boolean;selectionText?:string},tab:{url?:string;title?:string},origin=DEFAULT_CARRY_ORIGIN):string {
  if(info.editable||!info.selectionText?.trim()) {
    const base=new URL(captureAddress(tab,origin))
    base.hash='capture-error='+(info.editable?'selection-editable':'selection-empty')
    return base.href
  }
  const excerpt=info.selectionText.trim().slice(0,MAX_EXCERPT_LENGTH+1)
  const linked=tab.url?selectedTextUrl(tab.url,info.selectionText):null
  return captureAddress({...tab,url:linked??tab.url},origin,excerpt,!linked)
}
