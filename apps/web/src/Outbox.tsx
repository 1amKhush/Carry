import { useEffect, useState } from 'react'
import { localDB, type Outgoing } from './lib/device'
import { loadOutbox, retryHandoff } from './lib/handoffs'

export function Outbox() {
  const [entries,setEntries]=useState<Outgoing[]>([])
  const [error,setError]=useState('')
  const [busy,setBusy]=useState('')
  const [revision,setRevision]=useState(0)
  useEffect(()=>{
    let cancelled=false,inFlight=false
    async function refresh() {
      if(inFlight)return
      inFlight=true
      try {const result=await loadOutbox();if(!cancelled){setEntries(result);setError('')}}
      catch(error){
        const saved=await (await localDB()).getAll('outbox')
        if(!cancelled){setEntries(saved.sort((a,b)=>b.envelope.createdAt-a.envelope.createdAt));setError(error instanceof Error?error.message:'Could not load delivery states.')}
      }
      finally {inFlight=false}
    }
    void refresh()
    const interval=setInterval(()=>void refresh(),3000)
    return ()=>{cancelled=true;clearInterval(interval)}
  },[revision])
  async function retry(id:string) {
    setBusy(id)
    try {await retryHandoff(id);setRevision(v=>v+1)}
    catch(error){setError(error instanceof Error?error.message:'Could not confirm the send.')}
    finally {setBusy('')}
  }
  return <section className="pair-panel delivery-panel" aria-labelledby="delivery-heading">
    <h2 id="delivery-heading">Delivery</h2>
    <p>Queued: saved by the relay. Received: decrypted and saved by the other device. Continued: Continue was pressed. Cards expire after seven days.</p>
    {error&&<p className="send-error" role="alert">{error}</p>}
    <ul>{entries.map(entry=><li key={entry.envelope.id}><time dateTime={new Date(entry.envelope.createdAt).toISOString()}>{new Date(entry.envelope.createdAt).toLocaleString()}</time><strong>{entry.status==='unconfirmed'?'Unconfirmed':entry.status[0].toUpperCase()+entry.status.slice(1)}</strong>{entry.status==='unconfirmed'&&<button className="button device-copy" disabled={busy===entry.envelope.id} onClick={()=>void retry(entry.envelope.id)}>Retry saved send</button>}</li>)}</ul>
    {entries.length===0&&<p>Your encrypted sends will appear here.</p>}
  </section>
}
