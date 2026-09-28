import type { ResumeInput, ResumePlan } from '@carry/protocol/resume-ai'
import { api } from '../lib/transport'
import { parseResumeContent } from './resumePlan'

export async function requestFreeResumePlan(cardId:string,input:ResumeInput):Promise<{plan:ResumePlan;model:string}> {
  const result=await api('/ai/free','POST',{cardId,input},70_000)
  if(!result||typeof result!=='object'||!('content' in result)||typeof result.content!=='string'||!('model' in result)||typeof result.model!=='string')throw new Error('Free AI returned an invalid response. Your card is still ready to Continue.')
  return {plan:parseResumeContent(result.content,input),model:result.model}
}
export async function freeAssistanceAvailable():Promise<boolean> {
  const result=await api('/ai/free/status')
  return Boolean(result&&typeof result==='object'&&'enabled' in result&&result.enabled===true)
}
