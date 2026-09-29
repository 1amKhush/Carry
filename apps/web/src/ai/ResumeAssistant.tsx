import { useEffect, useState } from 'react'
import type { Card } from '@carry/protocol'
import { getOpenRouterKey } from './openrouter'
import { buildResumeInput, requestResumePlan, SYSTEM_PROMPT, type ResumePlan } from './resumePlan'
import { getFreeAssistanceStatus, requestFreeResumePlan, type FreeAssistanceStatus } from './freePlan'

export function ResumeAssistant({ card }: { card: Card }) {
  const [open,setOpen]=useState(false)
  const [mode,setMode]=useState<'free'|'own'>('free')
  const [freeStatus,setFreeStatus]=useState<FreeAssistanceStatus|null>(null)
  const [freeStatusError,setFreeStatusError]=useState(false)
  const [connected,setConnected]=useState<boolean|null>(null)
  const [modelChoice,setModelChoice]=useState<'free'|'other'>('free')
  const [otherModel,setOtherModel]=useState('')
  const [message,setMessage]=useState('')
  const [busy,setBusy]=useState(false)
  const [plan,setPlan]=useState<ResumePlan|null>(null)
  const [usedModel,setUsedModel]=useState('')
  const input=buildResumeInput(card)
  const model=modelChoice==='free'?'openrouter/free':otherModel.trim()
  useEffect(()=>{
    let mounted=true
    void getOpenRouterKey().then(key=>{if(mounted)setConnected(Boolean(key))}).catch(()=>{if(mounted)setConnected(false)})
    void getFreeAssistanceStatus().then(status=>{if(mounted)setFreeStatus(status)}).catch(()=>{if(mounted)setFreeStatusError(true)})
    return ()=>{mounted=false}
  },[])
  async function ask() {
    setBusy(true);setPlan(null);setMessage('');setUsedModel('')
    try {
      if(mode==='free') {
        const result=await requestFreeResumePlan(card.id,input)
        setPlan(result.plan);setUsedModel(result.model)
      } else {
        const key=await getOpenRouterKey()
        if(!key){setConnected(false);throw new Error('Connect your OpenRouter account in AI settings first.')}
        setPlan(await requestResumePlan(input,key,model));setUsedModel(model)
      }
    } catch(error){setMessage(error instanceof Error?error.message:'Could not get a plan. Your card is still ready to Continue.')}
    finally{
      setBusy(false)
      if(mode==='free')void getFreeAssistanceStatus().then(status=>{setFreeStatus(status);setFreeStatusError(false)}).catch(()=>setFreeStatusError(true))
    }
  }
  const canUseFree=!freeStatusError&&freeStatus?.enabled===true&&freeStatus.remainingPlans>0&&freeStatus.remainingAttempts>0&&freeStatus.sharedCapacityAvailable
  const canAsk=!busy&&(mode==='free'?canUseFree:connected===true&&(modelChoice==='free'||Boolean(otherModel.trim())))
  const freeMessage=freeStatusError?'Could not check free assistance right now. Try your own key or refresh the allowance.':!freeStatus?'Checking free assistance…':!freeStatus.enabled?'Free assistance is not configured on this deployment.':freeStatus.remainingPlans===0?'You have used your five free plans for this UTC day. Use your own key or try tomorrow.':freeStatus.remainingAttempts===0?'Your free retry allowance is used for this UTC day. Use your own key or try tomorrow.':!freeStatus.sharedCapacityAvailable?'Carry’s shared free capacity is used today. Try later or use your own key.':`${freeStatus.remainingPlans} of 5 free plans left today · ${freeStatus.remainingAttempts} model attempts left. Free models may still be busy.`
  return <section className="ai-assistant" aria-labelledby="ai-heading">
    <div className="ai-heading"><div><span className="card-kicker">OPTIONAL ASSISTANCE</span><h2 id="ai-heading">A little help picking up?</h2></div>
      <button type="button" className="button ai-open" onClick={()=>setOpen(value=>!value)} aria-expanded={open}>{open?'Hide AI help':'Help me resume'}</button></div>
    <p>Continue works without AI. Nothing from this card is sent for AI until you review and approve it.</p>
    {open&&<div className="ai-content">
      <div className="ai-model"><label htmlFor="ai-assistance-mode">Use</label><select id="ai-assistance-mode" value={mode} onChange={event=>{setMode(event.target.value as 'free'|'own');setPlan(null);setMessage('')}}><option value="free">Free assistance from Carry</option><option value="own">My OpenRouter key</option></select>
        {mode==='free'?<><p className="ai-allowance" role="status">{freeMessage}</p><button type="button" className="ai-refresh" onClick={()=>{setFreeStatus(null);setFreeStatusError(false);void getFreeAssistanceStatus().then(setFreeStatus).catch(()=>setFreeStatusError(true))}}>Refresh allowance</button></>
          :<><p>{connected===true?'Your saved key is ready on this device.':connected===null?'Checking your saved key…':'No personal key saved on this device.'} <a href="#settings">Manage your key in AI settings</a>.</p>
            <label htmlFor="ai-model-choice">Model for my account</label><select id="ai-model-choice" value={modelChoice} onChange={event=>{setModelChoice(event.target.value as 'free'|'other');setPlan(null)}}><option value="free">Free router (openrouter/free)</option><option value="other">Another model on my account</option></select>
            {modelChoice==='other'&&<><label htmlFor="ai-model-id">OpenRouter model ID</label><input id="ai-model-id" value={otherModel} onChange={event=>{setOtherModel(event.target.value);setPlan(null)}} placeholder="provider/model"/><p>Other models may charge your account. Carry requests only the model you enter.</p></>}</>}
      </div>
      <div className="ai-disclosure"><h3>Review what AI will receive</h3><p>{mode==='free'?'These card fields pass through Carry’s API to OpenRouter and up to three free-model providers if retries are needed. Carry also receives this card’s routing ID to verify access; it does not save the plaintext.':'These card fields go directly from this browser to OpenRouter and your selected model provider.'} Fixed instructions are also sent. AI does not open or read linked pages.</p><pre aria-label="Exact card data for OpenRouter">{JSON.stringify(input,null,2)}</pre><details><summary>View fixed AI instructions</summary><pre>{SYSTEM_PROMPT}</pre></details></div>
      <button type="button" className="button button-primary" disabled={!canAsk} onClick={()=>void ask()}>{busy?'Asking OpenRouter…':'Approve and ask AI'}</button>
      {message&&<p className="ai-message" role="status">{message}</p>}
      {plan&&<div className="ai-plan" role="region" aria-label="AI resume plan"><p className="field-hint">Generated with {usedModel}</p><h3>Where you left off</h3><p>{plan.whereYouLeftOff}</p><h3>Do next</h3><ol>{plan.doNext.map((step,index)=><li key={index}>{step}</li>)}</ol><h3>Useful links</h3>{plan.usefulLinks.length?<ul>{plan.usefulLinks.map(link=><li key={link.url}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a></li>)}</ul>:<p>No additional links suggested.</p>}{plan.insufficientContext&&<p className="ai-message">This card lacks enough context for a confident plan.</p>}</div>}
    </div>}
  </section>
}
