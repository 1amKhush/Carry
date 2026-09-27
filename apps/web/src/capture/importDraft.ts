import { openDB } from 'idb'
import { MAX_CAPTURE_LENGTH, normalizeCapture, type CaptureResult } from './normalize.ts'

export interface CaptureRequest { id:string; result:CaptureResult; sharedId?:string }
export function importDraft(input:unknown):CaptureRequest {
  return {id:crypto.randomUUID(),result:normalizeCapture(input)}
}
const captureDB=()=>openDB('carry-capture-v1',1,{upgrade(db){db.createObjectStore('pending',{keyPath:'id'})}})
export async function finishCapture(request:CaptureRequest) {
  if(!request.sharedId)return
  const db=await captureDB()
  try {await db.delete('pending',request.sharedId)} finally {db.close()}
}
export async function readCaptureLocation():Promise<CaptureRequest|null> {
  const fragment=location.hash
  if(!/^#(?:capture=|share=|capture-error=)/.test(fragment))return null
  // Remove the payload before identity registration, polling or React rendering.
  history.replaceState(history.state,'',location.pathname+location.search+'#new')
  if(fragment.startsWith('#capture-error=')) {
    const code=fragment.slice(15)
    const error=code==='selection-editable'?'Carry does not capture text from form fields or editable content. Select text in the page instead, or enter a detail below. Nothing was sent.':code==='selection-empty'?'No page text was selected. Highlight a short passage and try again, or enter a detail below. Nothing was sent.':'The shared page could not be opened locally. Open Carry once, then try Share again, or paste the link below. Nothing was sent.'
    return {id:crypto.randomUUID(),result:{error}}
  }
  if(fragment.startsWith('#capture=')) {
    try {
      if(fragment.length>MAX_CAPTURE_LENGTH*3)throw new Error('Capture too large')
      return importDraft(JSON.parse(decodeURIComponent(fragment.slice(9))))
    } catch {return {id:crypto.randomUUID(),result:{error:'This capture link is incomplete or malformed. You can still paste a page link below.'}}}
  }
  const id=fragment.slice(7)
  try {
    if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid share ID')
    const db=await captureDB()
    try {
      const saved=await db.get('pending',id)
      if(!saved||saved.createdAt<Date.now()-86400000)throw new Error('Share unavailable')
      return {...importDraft(saved.input),sharedId:id}
    } finally {db.close()}
  } catch {return {id:crypto.randomUUID(),result:{error:'This shared draft is unavailable or expired. Please paste its link below.'}}}
}
