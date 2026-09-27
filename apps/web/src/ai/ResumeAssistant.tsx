import { useEffect, useState } from 'react'
import type { Card } from '@carry/protocol'
import { beginOpenRouterOAuth, clearOpenRouterNotice, disconnectOpenRouter, getOpenRouterKey, readOpenRouterNotice, saveOpenRouterKey } from './openrouter'
import { buildResumeInput, FREE_MODEL, requestResumePlan, SYSTEM_PROMPT, type ResumePlan } from './resumePlan'

export function ResumeAssistant({ card }: { card: Card }) {
  const [open, setOpen] = useState(false)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [manualKey, setManualKey] = useState('')
  const [modelChoice, setModelChoice] = useState<'free' | 'other'>('free')
  const [otherModel, setOtherModel] = useState('')
  const [message, setMessage] = useState(readOpenRouterNotice)
  const [busy, setBusy] = useState(false)
  const [plan, setPlan] = useState<ResumePlan | null>(null)
  const input = buildResumeInput(card)
  const model = modelChoice === 'free' ? FREE_MODEL : otherModel.trim()

  useEffect(() => {
    let mounted = true
    clearOpenRouterNotice()
    void getOpenRouterKey().then(key => { if (mounted) setConnected(Boolean(key)) })
      .catch(() => { if (mounted) { setConnected(false); setMessage('Browser storage is unavailable. OpenRouter cannot connect on this device.') } })
    return () => { mounted = false }
  }, [])

  async function saveKey() {
    try {
      await saveOpenRouterKey(manualKey)
      setManualKey('')
      setConnected(true)
      setMessage('OpenRouter is connected on this device.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the key on this device.') }
  }
  async function disconnect() {
    try {
      await disconnectOpenRouter()
      setConnected(false)
      setManualKey('')
      setPlan(null)
      setMessage('OpenRouter key removed from this device.')
    } catch { setMessage('Could not remove the key from browser storage.') }
  }
  async function ask() {
    setBusy(true)
    setPlan(null)
    setMessage('')
    try {
      const key = await getOpenRouterKey()
      if (!key) { setConnected(false); throw new Error('Connect OpenRouter on this device first.') }
      setPlan(await requestResumePlan(input, key, model))
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not get a plan. Your card is still ready to Continue.') }
    finally { setBusy(false) }
  }

  return <section className="ai-assistant" aria-labelledby="ai-heading">
    <div className="ai-heading"><div><span className="card-kicker">OPTIONAL ASSISTANCE</span><h2 id="ai-heading">A little help picking up?</h2></div>
      <button type="button" className="button ai-open" onClick={() => setOpen(value => !value)} aria-expanded={open}>{open ? 'Hide AI help' : 'Help me resume'}</button></div>
    <p>Continue works without AI. Nothing from this card is sent to OpenRouter until you review and approve it.</p>
    {open && <div className="ai-content">
      <div className="ai-connection">
        <h3>Connect OpenRouter <span className="optional-label">on this device only</span></h3>
        <p>Use your own account. The key stays in this browser’s storage and is sent only to OpenRouter. Clearing this site’s data removes it.</p>
        {connected === null ? <p role="status">Checking browser connection…</p> : connected === true ? <div className="ai-connected"><span role="status">Connected on this device</span><button type="button" className="refresh-inbox" onClick={() => void disconnect()} disabled={busy}>Disconnect and remove key</button></div>
          : <><button type="button" className="refresh-inbox" onClick={() => { void beginOpenRouterOAuth().catch(() => setMessage('Could not start OpenRouter sign-in. Try manual key entry.')) }}>Connect OpenRouter</button>
            <div className="ai-manual"><label htmlFor="openrouter-key">Or enter your own OpenRouter API key</label><div className="ai-manual-row"><input id="openrouter-key" type="password" autoComplete="off" spellCheck={false} value={manualKey} onChange={event => setManualKey(event.target.value)} placeholder="sk-or-…"/><button type="button" className="refresh-inbox" onClick={() => void saveKey()} disabled={!manualKey.trim()}>Save key</button></div></div></>}
      </div>
      <div className="ai-model"><label htmlFor="ai-model-choice">Model</label><select id="ai-model-choice" value={modelChoice} onChange={event => { setModelChoice(event.target.value as 'free' | 'other'); setPlan(null) }}><option value="free">Free router (openrouter/free)</option><option value="other">Another model on my account</option></select>
        {modelChoice === 'other' && <><label htmlFor="ai-model-id">OpenRouter model ID</label><input id="ai-model-id" value={otherModel} onChange={event => { setOtherModel(event.target.value); setPlan(null) }} placeholder="provider/model"/><p>Other models may charge your account. Carry will request only the model you enter.</p></>}
      </div>
      <div className="ai-disclosure"><h3>Review what AI will receive</h3><p>Only these card fields are sent from this browser directly to OpenRouter and its selected model provider. Carry also sends fixed instructions to write a short plan. AI does not open or read linked pages.</p><pre aria-label="Exact card data for OpenRouter">{JSON.stringify(input, null, 2)}</pre><details><summary>View fixed AI instructions</summary><pre>{SYSTEM_PROMPT}</pre></details></div>
      <button type="button" className="button button-primary" disabled={connected !== true || busy || (modelChoice === 'other' && !otherModel.trim())} onClick={() => void ask()}>{busy ? 'Asking OpenRouter…' : 'Approve and ask AI'}</button>
      {message && <p className={plan ? 'notice' : 'ai-message'} role="status">{message}</p>}
      {plan && <div className="ai-plan" role="region" aria-label="AI resume plan"><h3>Where you left off</h3><p>{plan.whereYouLeftOff}</p><h3>Do next</h3><ol>{plan.doNext.map((step, index) => <li key={index}>{step}</li>)}</ol><h3>Useful links</h3>{plan.usefulLinks.length ? <ul>{plan.usefulLinks.map(link => <li key={link.url}><a href={link.url} target="_blank" rel="noopener noreferrer">{link.label}</a></li>)}</ul> : <p>No additional links suggested.</p>}{plan.insufficientContext && <p className="ai-message">This card lacks enough context for a confident plan.</p>}</div>}
    </div>}
  </section>
}
