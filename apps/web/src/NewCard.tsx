import { useRef, useState, type FormEvent } from 'react'
import { linkLabel } from './card'
import { MAX_RELATED_LINKS, MAX_TITLE_LENGTH, MAX_NOTE_LENGTH, MAX_URL_LENGTH, parseHttpUrl, validateCard, type Card } from '@carry/protocol'
import { sendHandoff } from './lib/handoffs'
import { Icon } from './Icon'
import type { Pair } from '@carry/protocol/secure'
import { peerLabel } from './lib/pairing'

interface RelatedInput { id: number; value: string }

export function NewCard({ onNotice, deviceId, peers }: { onNotice: (message: string) => void; deviceId: string; peers: Pair[] }) {
  const [recipient, setRecipient] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [primaryUrl, setPrimaryUrl] = useState('')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [related, setRelated] = useState<RelatedInput[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const nextRelatedId = useRef(1)
  const sendAttempt = useRef<{ content: string; card: Card } | null>(null)
  const selectedPair = peers.find(p => p.id === recipient) ?? (peers.length === 1 ? peers[0] : undefined)
  const primary = parseHttpUrl(primaryUrl)
  const previewLinks = related.map((item) => parseHttpUrl(item.value)).filter((url): url is string => url !== null)

  function clearError(name: string) {
    setErrors((previous) => ({ ...previous, [name]: '' }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending) return
    setSendError('')
    onNotice('')
    const validationErrors: Record<string, string> = {}
    if (!primary) validationErrors.primary = 'Enter a complete link starting with https:// or http://.'
    if (!selectedPair) validationErrors.recipient = 'Pair and select a trusted device before sending.'
    const relatedUrls: string[] = []
    for (const item of related) {
      if (!item.value.trim()) continue
      const url = parseHttpUrl(item.value)
      if (url) relatedUrls.push(url)
      else validationErrors[`related-${item.id}`] = 'Use a complete http:// or https:// link, or leave this blank.'
    }
    setErrors(validationErrors)
    const firstInvalid = Object.keys(validationErrors)[0]
    if (firstInvalid) {
      const input = event.currentTarget.elements.namedItem(firstInvalid)
      if (input instanceof HTMLInputElement) input.focus()
      return
    }
    if (!primary || !selectedPair) return
    const content = JSON.stringify([selectedPair.id, primary, relatedUrls, title.trim(), note.trim()])
    const card = sendAttempt.current?.content === content
      ? sendAttempt.current.card
      : { id: crypto.randomUUID(), createdAt: new Date().toISOString(), primaryUrl: primary, relatedUrls, title: title.trim(), note: note.trim() }
    if (!validateCard(card)) {
      setSendError('Check the card fields before sending.')
      return
    }
    sendAttempt.current = { content, card }
    setSending(true)
    try {
      await sendHandoff(card, selectedPair)
      sendAttempt.current = null
      onNotice('Queued. Your encrypted card is saved on the relay for the other device.')
      setPrimaryUrl('')
      setTitle('')
      setNote('')
      setRelated([])
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Unable to send. Your draft is still here.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section aria-labelledby="new-heading" className="screen">
      <div className="page-heading">
        <p className="eyebrow"><span />PICK UP WHERE YOU LEFT OFF</p>
        <h1 id="new-heading">New card<span className="accent">.</span></h1>
        <p>A link, a few thoughts, and everything you need to carry on.</p>
      </div>
      <div className="editor-layout">
        <form className="editor" onSubmit={submit} noValidate>
          <fieldset className="editor-fields" disabled={sending}>
          <div className="form-section">
            <div className="section-heading"><span className="step-number">01</span><h2>Your starting point</h2></div>
            <label htmlFor="primary">Primary link <span className="required-label">Required</span></label>
            <div className={`input-with-icon ${errors.primary ? 'has-error' : ''}`}>
              <Icon name="link" />
              <input id="primary" name="primary" type="url" required maxLength={MAX_URL_LENGTH} autoComplete="off" spellCheck={false} placeholder="https://something-worth-returning-to.com" value={primaryUrl} onChange={(event) => { setPrimaryUrl(event.target.value); clearError('primary') }} aria-invalid={Boolean(errors.primary)} aria-describedby={errors.primary ? 'primary-error' : 'primary-hint'} />
            </div>
            {errors.primary ? <p className="field-error" id="primary-error">{errors.primary}</p> : <p className="field-hint" id="primary-hint">This is the page you’ll open when you continue.</p>}
            <label htmlFor="title">Give it a name <span className="optional-label">Optional</span></label>
            <input id="title" name="title" maxLength={MAX_TITLE_LENGTH} placeholder="e.g. Pick up the weekend plans" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="form-section">
            <div className="section-heading"><span className="step-number">02</span><h2>Bring the context</h2><span className="optional-label">Optional</span></div>
            <div className="label-row"><span className="field-label" id="related-label">Related links</span><span className="field-hint">{related.length} / {MAX_RELATED_LINKS}</span></div>
            <div className="related-inputs" role="group" aria-labelledby="related-label">
              {related.map((item, index) => (
                <div key={item.id}>
                  <div className="related-row">
                    <div className={`input-with-icon ${errors[`related-${item.id}`] ? 'has-error' : ''}`}>
                      <Icon name="link" />
                      <input id={`related-${item.id}`} name={`related-${item.id}`} aria-label={`Related link ${index + 1}`} aria-invalid={Boolean(errors[`related-${item.id}`])} aria-describedby={errors[`related-${item.id}`] ? `related-error-${item.id}` : undefined} type="url" maxLength={MAX_URL_LENGTH} autoComplete="off" spellCheck={false} placeholder="https://another-useful-page.com" value={item.value} onChange={(event) => { setRelated((previous) => previous.map((row) => row.id === item.id ? { ...row, value: event.target.value } : row)); clearError(`related-${item.id}`) }} />
                    </div>
                    <button className="icon-button" type="button" aria-label={`Remove related link ${index + 1}`} onClick={() => { setRelated((previous) => previous.filter((row) => row.id !== item.id)); clearError(`related-${item.id}`) }}><Icon name="close" /></button>
                  </div>
                  {errors[`related-${item.id}`] && <p className="field-error" id={`related-error-${item.id}`}>{errors[`related-${item.id}`]}</p>}
                </div>
              ))}
              <button className="add-link" type="button" disabled={related.length >= MAX_RELATED_LINKS} onClick={() => {
                const id = nextRelatedId.current++
                setRelated((previous) => [...previous, { id, value: '' }])
                requestAnimationFrame(() => document.getElementById(`related-${id}`)?.focus())
              }}><Icon name="plus" />{related.length >= MAX_RELATED_LINKS ? 'All three links added' : 'Add a related link'}</button>
            </div>
            <div className="label-row note-label"><label htmlFor="note">A note to your future self</label><span className="field-hint">{note.length} / 1,000</span></div>
            <textarea id="note" name="note" rows={4} maxLength={MAX_NOTE_LENGTH} placeholder="Where did you leave off? What’s the next small step?" value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
          <div className="form-section recipient-section">
            <label htmlFor="recipient">Send to <span className="required-label">Paired device</span></label>
            <select id="recipient" name="recipient" value={selectedPair?.id ?? ''} onChange={event => { setRecipient(event.target.value); clearError('recipient') }} aria-invalid={Boolean(errors.recipient)} aria-describedby="recipient-hint">
              <option value="">Select a trusted device</option>
              {peers.map(pair => <option key={pair.id} value={pair.id}>{peerLabel(pair, deviceId)}</option>)}
            </select>
            <p className="field-hint" id="recipient-hint">{peers.length ? 'Only approved devices can receive your cards.' : <a href="#pair">Pair a device to send your first card.</a>}</p>
            {errors.recipient && <p className="field-error">{errors.recipient}</p>}
          </div>
          {sendError && <p className="send-error" role="alert">{sendError}</p>}
          <div className="form-actions"><p><Icon name="inbox" />Encrypted before sending.</p><button className="button button-primary" type="submit" disabled={!selectedPair}>{sending ? 'Sending…' : 'Send card'} <Icon name="arrow" /></button></div>
          </fieldset>
        </form>
        <aside className="preview-panel" aria-label="Live card preview">
          <div className="preview-label"><span className="eyebrow">A LOOK AHEAD</span><span className="live-label"><span className="status-dot" />Live preview</span></div>
          <div className="preview-stack">
            <article className="preview-card">
              <div className="card-topline"><span className="card-icon"><Icon name="link" /></span><span className="card-kicker">YOUR HANDOFF CARD</span></div>
              <h2>{title.trim() || (primary ? linkLabel(primary) : 'Your next starting point')}</h2>
              <p className={`preview-domain ${primary ? '' : 'placeholder-text'}`}>{primary ? linkLabel(primary) : 'Your primary link will appear here'}</p>
              <div className={`preview-note ${note.trim() ? '' : 'placeholder-text'}`}><Icon name="note" /><p>{note.trim() || 'Leave a little context. Your future self will thank you.'}</p></div>
              {previewLinks.length > 0 && <div className="preview-related"><span className="card-kicker">ALONG FOR THE RIDE</span>{previewLinks.map((url, index) => <span className="preview-related-link" key={index}><Icon name="link" />{linkLabel(url)}</span>)}</div>}
              <div className="preview-card-footer"><span>Ready to pick up</span><Icon name="arrow" /></div>
            </article>
          </div>
          <div className="preview-caption"><span className="caption-line" /><p>Less “where was I?”<br /><em>More “here we go.”</em></p></div>
          <p className="preview-footnote">Save the few things that matter.<br />Come back with your context intact.</p>
        </aside>
      </div>
    </section>
  )
}
