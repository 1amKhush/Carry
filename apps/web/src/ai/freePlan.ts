import type { ResumeInput, ResumePlan } from '@carry/protocol/resume-ai'
import { api } from '../lib/transport'
import { parseResumeContent } from './resumePlan'

export async function requestFreeResumePlan(cardId:string,input:ResumeInput):Promise<{plan:ResumePlan;model:string}> {
  const result=await api('/ai/free','POST',{cardId,input},70_000)
  if(!result||typeof result!=='object'||!('content' in result)||typeof result.content!=='string'||!('model' in result)||typeof result.model!=='string')throw new Error('Free AI returned an invalid response. Your card is still ready to Continue.')
  return {plan:parseResumeContent(result.content,input),model:result.model}
}
export interface FreeAssistanceStatus {
  enabled:boolean
  remainingPlans:number
  remainingAttempts:number
  sharedCapacityAvailable:boolean
}
export async function getFreeAssistanceStatus():Promise<FreeAssistanceStatus> {
  const result=await api('/ai/free/status')
  if(!result||typeof result!=='object')throw new Error('Free assistance status is unavailable.')
  const status=result as Partial<FreeAssistanceStatus>
  if(typeof status.enabled!=='boolean'||!Number.isInteger(status.remainingPlans)||!Number.isInteger(status.remainingAttempts)||typeof status.sharedCapacityAvailable!=='boolean')throw new Error('Free assistance status is unavailable.')
  return status as FreeAssistanceStatus
}
