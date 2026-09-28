import { buildResumeInput, resumeRequestBody, validateResumePlan, SYSTEM_PROMPT, type ResumeInput, type ResumePlan } from '@carry/protocol/resume-ai'
export { buildResumeInput, resumeRequestBody, validateResumePlan, SYSTEM_PROMPT, type ResumeInput, type ResumePlan }

const API_URL = 'https://openrouter.ai/api/v1/chat/completions'
export const FREE_MODEL = 'openrouter/free'

export function parseResumeContent(content:string,input:ResumeInput):ResumePlan {
  if(content.length>12_000)throw new Error('AI returned an invalid plan. Your card is still ready to Continue.')
  const trimmed=content.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,'$1')
  try{return validateResumePlan(JSON.parse(trimmed),input)}
  catch{throw new Error('AI returned an invalid plan. Your card is still ready to Continue.')}
}
export async function requestResumePlan(input: ResumeInput, key: string, model: string): Promise<ResumePlan> {
  const body = resumeRequestBody(input, model)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45_000)
  try {
    const response = await fetch(API_URL, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal,
    })
    if (response.status === 401 || response.status === 403) throw new Error('OpenRouter rejected this key. Reconnect or enter a new key.')
    if (response.status === 402) throw new Error('This model needs credits on your OpenRouter account. Choose the free router or use Continue without AI.')
    if (response.status === 429) throw new Error('OpenRouter is rate limited. Try later or use Continue without AI.')
    if (!response.ok) throw new Error('The selected model is unavailable or OpenRouter could not respond. Your card is still ready to Continue.')
    const raw = await response.text()
    if (raw.length > 64_000) throw new Error('AI response was too large. Your card is still ready to Continue.')
    const result: unknown = JSON.parse(raw)
    const content = (result as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content
    if (typeof content !== 'string' || content.length > 12_000) throw new Error('AI returned an unexpected response. Your card is still ready to Continue.')
    return parseResumeContent(content,input)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('OpenRouter timed out. Your card is still ready to Continue.')
    if (error instanceof SyntaxError) throw new Error('AI returned an invalid response. Your card is still ready to Continue.')
    throw error
  } finally { clearTimeout(timeout) }
}
