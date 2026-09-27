import { MAX_NOTE_LENGTH, MAX_RELATED_LINKS, MAX_TITLE_LENGTH, MAX_URL_LENGTH, validateCard, type Card } from '@carry/protocol'
export interface EditorDraft {
  primaryUrl:string;title:string;note:string;recipient:string
  related:{id:number;value:string}[]
  attempt:{content:string;card:Card}|null
}
const key='carry.editor-draft.v1'
export function emptyDraft():EditorDraft {return {primaryUrl:'',title:'',note:'',recipient:'',related:[],attempt:null}}
export function loadEditorDraft():EditorDraft {
  try {
    const saved=JSON.parse(sessionStorage.getItem(key)??'null')
    if(!saved)return emptyDraft()
    for(const [name,max] of [['primaryUrl',MAX_URL_LENGTH],['title',MAX_TITLE_LENGTH],['note',MAX_NOTE_LENGTH],['recipient',100]] as const)if(typeof saved[name]!=='string'||saved[name].length>max)return emptyDraft()
    if(!Array.isArray(saved.related)||saved.related.length>MAX_RELATED_LINKS||saved.related.some((r:{id:unknown;value:unknown})=>!r||!Number.isSafeInteger(r.id)||typeof r.value!=='string'||r.value.length>MAX_URL_LENGTH))return emptyDraft()
    return {...saved,attempt:saved.attempt&&typeof saved.attempt.content==='string'&&validateCard(saved.attempt.card)?saved.attempt:null}
  } catch {return emptyDraft()}
}
export function saveEditorDraft(draft:EditorDraft):boolean {
  try {sessionStorage.setItem(key,JSON.stringify(draft));return true} catch {return false}
}
