import { MAX_EXCERPT_LENGTH, MAX_TITLE_LENGTH, parseExactHttpUrl } from '@carry/protocol'

export interface CaptureDraft { url:string; title:string; excerpt:string }
export type CaptureResult = {draft:CaptureDraft;message:string} | {error:string}
export const MAX_CAPTURE_LENGTH=8192

// URL has precedence. Some Android browsers put the link in text instead.
export function normalizeCapture(input:unknown):CaptureResult {
  if(!input||typeof input!=='object'||Array.isArray(input))return {error:'This capture is missing a page link. Paste an HTTP or HTTPS link below.'}
  const value=input as Record<string,unknown>
  for(const key of ['url','title','text','excerpt'])if(value[key]!==undefined&&(typeof value[key]!=='string'||value[key].length>MAX_CAPTURE_LENGTH))return {error:'This capture is too large or malformed. Paste the page link below.'}
  let url=typeof value.url==='string'?value.url.trim():''
  if(!url) {
    const text=typeof value.text==='string'?value.text.trim():''
    const links=text.split(/\s+/).filter(part=>/^https?:\/\//i.test(part))
    if(links.length>1)return {error:'Several links were shared. Paste the one you want to continue below.'}
    url=/^https?:\/\//i.test(text)?text:links.length===1?links[0]:text
  }
  const exact=parseExactHttpUrl(url)
  if(!exact)return {error:'Carry needs a complete HTTP or HTTPS page link. This capture was not added; you can paste a link below.'}
  const title=typeof value.title==='string'?value.title:''
  const excerpt=typeof value.excerpt==='string'?value.excerpt.trim():''
  const tooLong=excerpt.length>MAX_EXCERPT_LENGTH
  const message=tooLong?'The selected text is too long. Select a passage under 1,200 characters or add a shorter excerpt below. Nothing was sent.':title.length>MAX_TITLE_LENGTH?'The page title was shortened. Review your draft before sending.':'Page captured. Review your draft and choose a device. Nothing has been sent.'
  const selectionMessage=value.selectionLinkUnavailable===true?' The original page URL is saved, but it was too long to link to the selected passage.':excerpt&&exact.includes(':~:text=')?' On supported pages, Continue opens the selected passage; identical text may match an earlier occurrence.':''
  return {draft:{url:exact,title:title.slice(0,MAX_TITLE_LENGTH),excerpt:tooLong?'':excerpt},message:message+selectionMessage}
}
