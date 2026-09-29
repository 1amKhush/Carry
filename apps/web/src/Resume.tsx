import type { Card } from '@carry/protocol'
import { linkLabel } from './card'
import { Icon } from './Icon'
import { markContinued } from './lib/handoffs'
import { ResumeAssistant } from './ai/ResumeAssistant'

export function Resume({ card, onReceiptError }: { card:Card; onReceiptError:()=>void }) {
  const title=card.title||linkLabel(card.primaryUrl)
  return <><article className="resume-card" aria-label={`Resume ${title}`}>
    <div className="resume-action">
      <span className="card-kicker">NEXT ACTION</span>
      <h2>{card.nextAction||'Continue where you left off.'}</h2>
    </div>
    {card.goal&&<div className="resume-context"><span className="card-kicker">GOAL</span><p>{card.goal}</p></div>}
    {card.excerpt&&<div className="resume-context resume-excerpt"><span className="card-kicker">RELEVANT DETAIL</span><blockquote>{card.excerpt}</blockquote></div>}
    <div className="resume-destination">
      <span className="card-kicker">PICK UP HERE</span>
      <h3>{title}</h3>
      <p>{card.primaryUrl}</p>
      {card.primaryUrl.split('#')[1]?.includes(':~:text=')&&<p className="passage-cue">Selected passage link · A supporting browser will try to highlight the passage.</p>}
      <a className="button button-primary" href={card.primaryUrl} target="_blank" rel="noopener noreferrer" onClick={()=>{void markContinued(card.id).catch(onReceiptError)}} aria-label={`Continue to ${title} (opens in a new tab)`}>Continue <Icon name="arrow" /></a>
    </div>
    {card.relatedUrls.length>0&&<div className="saved-related"><span className="card-kicker">RELATED LINKS · {card.relatedUrls.length}</span><ul>{card.relatedUrls.map((url,index)=><li key={index}><a href={url} target="_blank" rel="noopener noreferrer" aria-label={`Related link: ${url} (opens in a new tab)`}><Icon name="link"/><span>{url}</span><Icon name="external"/></a></li>)}</ul></div>}
    {card.note&&<div className="saved-note"><span className="card-kicker">ORIGINAL NOTE</span><p>{card.note}</p></div>}
  </article><ResumeAssistant key={card.id} card={card}/></>
}
