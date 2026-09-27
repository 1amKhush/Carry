import { useEffect, useState } from 'react'
import { loadInbox } from './lib/handoffs'
import { linkLabel, type Card } from './card'
import { Icon } from './Icon'
import { Resume } from './Resume'

export function Inbox({resumeId}:{resumeId?:string}) {
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
  if(resumeId) {
    const card=cards.find(item=>item.id===resumeId)
    return <section aria-labelledby="resume-heading" className="screen">
      <a className="resume-back" href="#inbox">← Back to Inbox</a>
      <div className="page-heading"><p className="eyebrow"><span />YOUR CONTEXT, READY WHEN YOU ARE</p><h1 id="resume-heading">Resume<span className="accent">.</span></h1></div>
      {error&&<p className="send-error" role="alert">{error}</p>}
      {card?<Resume card={card} onReceiptError={()=>setError('Continue was pressed. Its receipt will retry when the relay is reachable.')}/>:<p className="inbox-session-note" role="status">{loading?'Loading your card…':'This card is unavailable or has expired. Return to your Inbox.'}</p>}
    </section>
  }
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
            <p className="inbox-url">{card.primaryUrl}</p>
            {card.nextAction&&<p className="inbox-next"><span className="card-kicker">NEXT ACTION</span>{card.nextAction}</p>}
            <div className="inbox-card-footer"><span>Ready when you are</span><a className="button button-primary" href={'#resume/'+card.id} aria-label={`Resume ${card.title||linkLabel(card.primaryUrl)}`}>Resume <Icon name="arrow" /></a></div>
          </article>
        ))}</div>
      )}
      <p className="inbox-session-note">Refreshes every 3 seconds while open. Cards survive closing this browser; encrypted cards stay available for seven days, including after a relay restart.</p>
    </section>
  )
}
