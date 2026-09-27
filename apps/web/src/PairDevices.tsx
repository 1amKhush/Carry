import { useEffect, useEffectEvent, useState } from 'react'
import QRCode from 'qrcode'
import { verificationCode } from '@carry/crypto'
import type { Pair } from '@carry/protocol/secure'
import { approvePair, createInvitation, joinInvitation, pendingPairings, peerLabel, unpair } from './lib/pairing'

export function PairDevices({deviceId,peers,onChange}:{deviceId:string;peers:Pair[];onChange:()=>void}) {
  const [link,setLink]=useState('')
  const [invitation,setInvitation]=useState<{url:string;expiresAt:number;qr:string}|null>(null)
  const [pending,setPending]=useState<{pair:Pair;code:string}[]>([])
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  async function refresh() {
    const pairs=await pendingPairings()
    setPending(await Promise.all(pairs.map(async pair=>({pair,code:await verificationCode(pair)}))))
    onChange()
  }
  useEffect(()=>{
    let cancelled=false
    async function poll() {
      try {
        const pairs=await pendingPairings()
        const rows=await Promise.all(pairs.map(async pair=>({pair,code:await verificationCode(pair)})))
        if(!cancelled)setPending(rows)
        onChange()
      } catch(error){if(!cancelled)setError(error instanceof Error?error.message:'Pairing could not refresh.')}
    }
    void poll()
    const interval=setInterval(()=>void poll(),3000)
    return ()=>{cancelled=true;clearInterval(interval)}
  },[onChange])
  async function join(value:string) {
    setBusy(true);setError('');setNotice('')
    try {await joinInvitation(value);setLink('');setNotice('Compare the verification code on both devices.');await refresh()}
    catch(error){setError(error instanceof Error?error.message:'Invalid invitation.')}
    finally {setBusy(false)}
  }
  const consumeInvitation=useEffectEvent(()=>{
    if(location.hash.startsWith('#pair=')) {
      const value=location.href
      history.replaceState(null,'','#pair')
      void join(value)
    }
  })
  useEffect(()=>{
    const consume=()=>consumeInvitation()
    consume()
    window.addEventListener('hashchange',consume)
    return ()=>window.removeEventListener('hashchange',consume)
  },[])
  async function invite() {
    setBusy(true);setError('');setNotice('')
    try {
      const created=await createInvitation()
      setInvitation({url:created.url,expiresAt:created.invitation.expiresAt,qr:await QRCode.toDataURL(created.url,{width:320,margin:3,errorCorrectionLevel:'L'})})
      setNotice('Scan with the other device’s camera, then compare the code here.')
    } catch(error){setError(error instanceof Error?error.message:'Could not create an invitation.')}
    finally {setBusy(false)}
  }
  async function approve(pair:Pair) {
    setBusy(true);setError('')
    try {await approvePair(pair);setNotice('Approved here. Both devices must approve before sending.');await refresh()}
    catch(error){setError(error instanceof Error?error.message:'Approval failed. Retry when connected.')}
    finally {setBusy(false)}
  }
  async function revoke(pair:Pair) {
    setBusy(true);setError('')
    try {await unpair(pair.id);setNotice('Device unpaired. Its queued cards have been removed.');onChange()}
    catch(error){setError(error instanceof Error?error.message:'Could not unpair. Reconnect and try again.')}
    finally {setBusy(false)}
  }
  return <section className="screen" aria-labelledby="pair-heading">
    <div className="page-heading"><p className="eyebrow">ONE SMALL INTRODUCTION</p><h1 id="pair-heading">Pair a device<span className="accent">.</span></h1><p>Scan an invitation and approve the same verification code on both screens.</p></div>
    {error&&<p className="send-error" role="alert">{error}</p>}
    <p className="pair-notice" role="status">{notice}</p>
    <div className="pair-layout">
      <section className="pair-panel" aria-labelledby="invite-heading"><h2 id="invite-heading">Invite your other device</h2><p>Open the invitation with your phone’s camera. The link expires in five minutes.</p>
        <button className="button button-primary" disabled={busy} onClick={()=>void invite()}>Create invitation</button>
        {invitation&&<div className="invitation">
          <img src={invitation.qr} alt="Scan this QR invitation on your other device" width="320" height="320"/>
          <label htmlFor="invitation-link">Invitation link</label><input id="invitation-link" readOnly value={invitation.url} onFocus={e=>e.currentTarget.select()}/>
          <p>Expires at {new Date(invitation.expiresAt).toLocaleTimeString()}. Keep this invitation private.</p>
        </div>}
      </section>
      <section className="pair-panel" aria-labelledby="join-heading"><h2 id="join-heading">Have an invitation?</h2><p>You can also open or paste the invitation link on your second device.</p>
        <form onSubmit={e=>{e.preventDefault();void join(link)}}>
          <label htmlFor="join-link">Paste invitation link</label><input id="join-link" type="url" required autoComplete="off" value={link} onChange={e=>setLink(e.target.value)}/>
          <button className="button device-copy" disabled={busy||!link}>Join invitation</button>
        </form>
      </section>
    </div>
    {pending.map(({pair,code})=>{
      const approved=pair.inviter.id===deviceId?pair.inviterSignature:pair.joinerSignature
      return <section className="pair-panel verification-panel" key={pair.id} aria-label="Verify pairing">
        <h2>Check both screens</h2><p>All four groups must match. Approve only when you can see this exact code on your other device.</p>
        <output className="verification-code" aria-label="Verification code">{code}</output>
        <p>{peerLabel(pair,deviceId)}</p>
        <button className="button button-primary" disabled={busy||Boolean(approved)} onClick={()=>void approve(pair)}>{approved?'Approved here · waiting for other device':'Codes match — Approve'}</button>
      </section>
    })}
    <section className="pair-panel trusted-devices" aria-labelledby="trusted-heading"><h2 id="trusted-heading">Trusted devices</h2>
      {peers.length===0?<p>No paired devices yet. Approve the code on both screens to finish.</p>:<ul>{peers.map(pair=><li key={pair.id}><div><strong>{peerLabel(pair,deviceId)}</strong><p>Paired · ready for private cards</p></div><button className="button device-copy" disabled={busy} onClick={()=>void revoke(pair)}>Unpair</button></li>)}</ul>}
    </section>
  </section>
}
