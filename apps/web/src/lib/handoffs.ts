import { decryptCard, encryptCard } from '@carry/crypto'
import { envelopeSchema, z, type Pair } from '@carry/protocol/secure'
import type { Card } from '@carry/protocol'
import { getIdentity, localDB, pruneLocal, type Outgoing } from './device'
import { api } from './transport'
import { otherDevice, trustedPeers } from './pairing'

export async function retryHandoff(id:string) {
  const db=await localDB(), entry=await db.get('outbox',id)
  if(!entry)throw new Error('Saved send unavailable.')
  const result=z.object({id:z.string(),status:z.enum(['queued','received','continued'])}).parse(await api('/envelopes','POST',entry.envelope))
  if(result.id!==id)throw new Error('Invalid send confirmation.')
  await db.put('outbox',{...entry,status:result.status},id)
}
export async function sendHandoff(card:Card,pair:Pair) {
  const identity=await getIdentity(), db=await localDB()
  let entry=await db.get('outbox',card.id)
  if(!entry) {
    entry={envelope:await encryptCard(identity,otherDevice(pair,identity.public.id),pair.id,card),status:'unconfirmed'}
    await db.put('outbox',entry,entry.envelope.id)
  }
  await retryHandoff(entry.envelope.id)
}
export async function loadOutbox():Promise<Outgoing[]> {
  await pruneLocal()
  const db=await localDB()
  const result=z.object({receipts:z.array(z.object({id:z.string(),status:z.enum(['queued','received','continued'])}))}).parse(await api('/outbox'))
  for(const receipt of result.receipts) {
    const entry=await db.get('outbox',receipt.id)
    if(entry)await db.put('outbox',{...entry,status:receipt.status},receipt.id)
  }
  return (await db.getAll('outbox')).sort((a,b)=>b.envelope.createdAt-a.envelope.createdAt)
}
async function sendReceipt(id:string,continued:boolean) {
  await api('/envelopes/'+id+'/receipt','POST',{status:'received'})
  if(continued)await api('/envelopes/'+id+'/receipt','POST',{status:'continued'})
  const db=await localDB(), tx=db.transaction('inbox','readwrite'), saved=await tx.store.get(id)
  if(saved)await tx.store.put({...saved,acknowledged:saved.acknowledged==='continued'||continued?'continued':'received'},id)
  await tx.done
}
export async function markContinued(id:string) {
  const db=await localDB(), tx=db.transaction('inbox','readwrite'), saved=await tx.store.get(id)
  if(!saved)throw new Error('This card has expired.')
  await tx.store.put({...saved,receipt:'continued'},id)
  await tx.done
  await sendReceipt(id,true)
}
export async function loadInbox():Promise<{cards:Card[];warning:string}> {
  await pruneLocal()
  const identity=await getIdentity(), db=await localDB(), peers=await trustedPeers()
  const result=z.object({envelopes:z.array(z.unknown())}).parse(await api('/inbox'))
  const cards:Card[]=[]
  let warning=''
  for(const input of result.envelopes) {
    try {
      const envelope=envelopeSchema.parse(input), pair=peers.find(p=>p.id===envelope.pairId)
      if(!pair)throw new Error('Untrusted sender.')
      const card=await decryptCard(identity,otherDevice(pair,identity.public.id),pair.id,envelope)
      const tx=db.transaction('inbox','readwrite')
      const saved=await tx.store.get(envelope.id)
      await tx.store.put({envelope,receipt:saved?.receipt??'received',acknowledged:saved?.acknowledged},envelope.id)
      await tx.done
      cards.push(card)
      try {if(!saved?.acknowledged || saved.acknowledged!==saved.receipt)await sendReceipt(envelope.id,saved?.receipt==='continued')}
      catch {warning='Cards are saved on this device. Delivery receipts will retry on the next refresh.'}
    } catch {warning='A card could not be verified. It has not been acknowledged.'}
  }
  return {cards,warning}
}
