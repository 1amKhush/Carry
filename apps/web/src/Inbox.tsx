import { useEffect, useState } from 'react'
import { loadInbox, markContinued } from './lib/handoffs'
import { linkLabel, type Card } from './card'
import { Icon } from './Icon'

export function Inbox() {
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let inFlight = false
    async function refresh() {
      if (inFlight) return
      inFlight = true
      setLoading(true)
      try {
        const received = await loadInbox()
        if (!controller.signal.aborted) { setCards(received.cards); setError(received.warning) }
      } catch {
        if (!controller.signal.aborted) setError('Could not refresh the inbox. Check your connection to the relay. Any cards below may be out of date.')
      } finally {
        inFlight = false
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void refresh()
    const interval = window.setInterval(() => { void refresh() }, 3000)
    return () => { controller.abort(); window.clearInterval(interval) }
  }, [refreshKey])
  return (
    <section aria-labelledby="inbox-heading" className="screen">
      <div className="page-heading inbox-heading">
        <div><p className="eyebrow"><span />YOUR CONTEXT, KEPT TOGETHER</p><h1 id="inbox-heading">Inbox<span className="accent">.</span></h1><p>A clear place to return. Pick a card and carry on.</p></div>
        <a className="button button-primary" href="#new"><Icon name="plus" />New card</a>
      </div>
      <div className="inbox-section-label"><h2>THIS DEVICE <span>{cards.length}</span></h2><button className="refresh-inbox" type="button" disabled={loading} onClick={() => setRefreshKey((value) => value + 1)}>{loading ? 'Refreshing…' : 'Refresh inbox'}</button></div>
      {error && <p className="send-error" role="alert">{error}</p>}
      {loading && cards.length === 0 && <p className="inbox-session-note" role="status">Loading your inbox…</p>}
      {cards.length === 0 ? (!loading && !error && (
        <div className="empty-inbox">
          <div className="empty-art" aria-hidden="true"><div className="empty-art-back" /><div className="empty-art-front"><Icon name="link" /><span /><span /><span className="empty-art-arrow"><Icon name="arrow" /></span></div></div>
          <p className="eyebrow">A LITTLE SPACE FOR YOUR NEXT THING</p>
          <h2>Your next chapter starts here.</h2>
          <p>Pair this device with your sending device.<br />Cards addressed to you will appear here.</p>
          <a className="button button-primary" href="#new">Send a card <Icon name="arrow" /></a>
        </div>
      )) : (
        <div className="inbox-grid">{cards.map((card) => (
          <article className="inbox-card" key={card.id}>
            <div className="card-topline"><span className="card-icon"><Icon name="link" /></span><time dateTime={card.createdAt}>{new Date(card.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><span className="local-card-label">Received</span></div>
            <h2>{card.title || linkLabel(card.primaryUrl)}</h2>
            <a className="primary-url" href={card.primaryUrl} target="_blank" rel="noopener noreferrer" aria-label={`Primary link: ${card.primaryUrl} (opens in a new tab)`}>{card.primaryUrl}<Icon name="external" /></a>
            {card.note && <div className="saved-note"><span className="card-kicker">NOTE TO SELF</span><p>{card.note}</p></div>}
            {card.relatedUrls.length > 0 && <div className="saved-related"><span className="card-kicker">RELATED LINKS · {card.relatedUrls.length}</span><ul>{card.relatedUrls.map((url, index) => <li key={index}><a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Related link: ${url} (opens in a new tab)`}><Icon name="link" /><span>{url}</span><Icon name="external" /></a></li>)}</ul></div>}
            <div className="inbox-card-footer"><span>Opens in a new tab</span><a className="button button-primary" href={card.primaryUrl} target="_blank" rel="noopener noreferrer" onClick={() => { void markContinued(card.id).catch(() => setError("Continue was pressed. Its receipt will retry when the relay is reachable.")) }} aria-label={`Continue to ${card.title || linkLabel(card.primaryUrl)} (opens in a new tab)`}>Continue <Icon name="arrow" /></a></div>
          </article>
        ))}</div>
      )}
      <p className="inbox-session-note">Refreshes every 3 seconds while open. Cards survive closing this browser; encrypted cards stay available for seven days, including after a relay restart.</p>
    </section>
  )
}
