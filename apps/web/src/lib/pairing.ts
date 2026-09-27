import { approvalMessage, base64url, bytes, hash, randomToken, sign, verifyInvitation, verifyPair } from '@carry/crypto'
import { invitationMessage, invitationSchema, INVITATION_MS, pairSchema, pairTranscript, z, type Invitation, type Pair } from '@carry/protocol/secure'
import { getIdentity, localDB, type PendingPair } from './device'
import { api, ApiError } from './transport'

export function otherDevice(pair:Pair,deviceId:string) {return pair.inviter.id===deviceId?pair.joiner:pair.inviter}
export function peerLabel(pair:Pair,deviceId:string) {return 'Device '+otherDevice(pair,deviceId).id.slice(0,8)}
export async function createInvitation() {
  const identity=await getIdentity()
  const invitation:Invitation={version:1,id:crypto.randomUUID(),origin:location.origin,inviter:identity.public,expiresAt:Date.now()+INVITATION_MS,secret:randomToken(),signature:''}
  const secretHash=await hash(invitation.secret)
  invitation.signature=await sign(identity,invitationMessage(invitation,secretHash))
  await api('/pairings','POST',{id:invitation.id,secretHash,expiresAt:invitation.expiresAt,signature:invitation.signature})
  await (await localDB()).put('pending',{id:invitation.id,inviter:identity.public.id},invitation.id)
  return {invitation,url:location.origin+'/#pair='+base64url(new TextEncoder().encode(JSON.stringify(invitation)))}
}
export async function joinInvitation(link:string) {
  const url=new URL(link)
  if (url.origin!==location.origin || !url.hash.startsWith('#pair=') || url.hash.length>4096) throw new Error('Use an invitation from this Carry address.')
  const invitation=invitationSchema.parse(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes(url.hash.slice(6)))))
  if (!await verifyInvitation(invitation,location.origin)) throw new Error('Invalid or expired invitation.')
  const result=z.object({pair:pairSchema}).parse(await api('/pairings/'+invitation.id+'/join','POST',{secret:invitation.secret}))
  if (result.pair.inviter.id!==invitation.inviter.id) throw new Error('The inviter’s keys changed. Create a new invitation.')
  const db=await localDB()
  const existing=await db.get('pending',invitation.id)
  await db.put('pending',{...existing,id:invitation.id,inviter:invitation.inviter.id},invitation.id)
  return result.pair
}
async function acceptProof(pair:Pair,pending:PendingPair) {
  if (!pending.approved || pending.transcript!==pairTranscript(pair)) throw new Error('Pairing approval does not match this device’s verification.')
  const db=await localDB()
  if (await db.get('revoked',pair.id)) throw new Error('This pairing was revoked.')
  if (pair.origin!==location.origin || !await verifyPair(pair)) throw new Error('Invalid pairing proof.')
  const tx=db.transaction(['peers','pending','revoked'],'readwrite')
  if(await tx.objectStore('revoked').get(pair.id)) {await tx.done;throw new Error('This pairing was revoked.')}
  await tx.objectStore('peers').put(pair,pair.id)
  await tx.objectStore('pending').delete(pair.id)
  await tx.done
}
export async function pairingStatus(id:string):Promise<Pair|null> {
  const result=z.object({pair:pairSchema.nullable()}).parse(await api('/pairings/'+id))
  const db=await localDB(), pending=await db.get('pending',id)
  if (result.pair && pending?.inviter && result.pair.inviter.id!==pending.inviter) throw new Error('The invitation’s keys changed.')
  if (result.pair?.active && pending) await acceptProof(result.pair,pending)
  return result.pair
}
export async function approvePair(pair:Pair) {
  const identity=await getIdentity(), db=await localDB(), pending=await db.get('pending',pair.id)
  if (!pending || ![pair.inviter.id,pair.joiner.id].includes(identity.public.id)) throw new Error('Pairing unavailable on this device.')
  const signature=await sign(identity,await approvalMessage(pair))
  const approved={...pending,approved:true,transcript:pairTranscript(pair)}
  await db.put('pending',approved,pair.id)
  const result=z.object({pair:pairSchema}).parse(await api('/pairings/'+pair.id+'/approve','POST',{signature}))
  if (result.pair.active) await acceptProof(result.pair,approved)
}
export async function trustedPeers() {
  const db=await localDB()
  const localBeforeRequest=await db.getAll('peers')
  const remote=z.object({pairs:z.array(pairSchema)}).parse(await api('/peers'))
  for (const pending of await db.getAll('pending')) {
    const proof=remote.pairs.find(p=>p.id===pending.id)
    if (proof && pending.approved) await acceptProof(proof,pending)
  }
  for (const local of localBeforeRequest) if (!remote.pairs.some(p=>p.id===local.id)) await removeTrust(local.id)
  return db.getAll('peers')
}
async function removeTrust(id:string) {
  const db=await localDB()
  const tx=db.transaction(['revoked','peers','pending','inbox','outbox'],'readwrite')
  await tx.objectStore('revoked').put(true,id)
  await tx.objectStore('peers').delete(id)
  await tx.objectStore('pending').delete(id)
  for (const name of ['inbox','outbox'] as const) for (const entry of await tx.objectStore(name).getAll()) {
    if(entry.envelope.pairId===id) await tx.objectStore(name).delete(entry.envelope.id)
  }
  await tx.done
}
export async function unpair(id:string) {await api('/pairs/'+id,'DELETE');await removeTrust(id)}
export async function pendingPairings() {
  const db=await localDB(), result:Pair[]=[]
  for (const pending of await db.getAll('pending')) {
    try {const pair=await pairingStatus(pending.id);if(pair&&!pair.active)result.push(pair)}
    catch(error) {if(error instanceof ApiError && error.status===404)await db.delete('pending',pending.id);else throw error}
  }
  return result
}
