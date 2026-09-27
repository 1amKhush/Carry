import { openDB, type DBSchema } from 'idb'
import { generateIdentity, type Identity } from '@carry/crypto'
import type { Envelope, Pair, Receipt } from '@carry/protocol/secure'

export interface PendingPair { id:string; transcript?:string; approved?:boolean; inviter?:string }
export interface SavedEnvelope { envelope:Envelope; receipt:'received'|'continued'; acknowledged?:'received'|'continued' }
export interface Outgoing { envelope:Envelope; status:Receipt|'unconfirmed' }
interface CarryDB extends DBSchema {
  identity:{key:string;value:Identity}
  peers:{key:string;value:Pair}
  pending:{key:string;value:PendingPair}
  revoked:{key:string;value:boolean}
  inbox:{key:string;value:SavedEnvelope}
  outbox:{key:string;value:Outgoing}
}
let database:ReturnType<typeof openDB<CarryDB>> | undefined
export function localDB() {
  database ??= openDB<CarryDB>('carry-secure-v1',1,{upgrade(db){
    for (const name of ['identity','peers','pending','revoked','inbox','outbox'] as const) db.createObjectStore(name)
  }})
  return database
}
let identityPromise:Promise<Identity> | undefined
export function getIdentity():Promise<Identity> {
  identityPromise ??= (async () => {
    if (!window.isSecureContext || !crypto.subtle) throw new Error('Open Carry through HTTPS to protect this device’s keys.')
    const db=await localDB(), existing=await db.get('identity','main')
    if (existing) return existing
    const identity=await generateIdentity()
    try { await db.add('identity',identity,'main'); return identity }
    catch (error) {
      const winner=await db.get('identity','main')
      if (winner) return winner
      throw error
    }
  })()
  return identityPromise
}
export async function pruneLocal() {
  const db=await localDB(), now=Date.now()
  const tx=db.transaction(['inbox','outbox'],'readwrite')
  for (const name of ['inbox','outbox'] as const) {
    for (const entry of await tx.objectStore(name).getAll()) if (entry.envelope.expiresAt<=now) await tx.objectStore(name).delete(entry.envelope.id)
  }
  await tx.done
}
