import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RelayStore } from '../src/store/sqlite.ts'
import type { Envelope } from '@carry/protocol/secure'

test('3A: commit survives restart; exact retry is one card; receipts retain it; expiry removes it', async () => {
  const directory = mkdtempSync(join(tmpdir(),'carry-durable-'))
  const path = join(directory,'relay.sqlite')
  const now = Date.now()
  const e: Envelope = { version:1,suite:'P256-HKDF-SHA256-A256GCM',id:crypto.randomUUID(),pairId:crypto.randomUUID(),
    senderId:'a'.repeat(43),recipientId:'b'.repeat(43),createdAt:now,expiresAt:now+60000,
    ephemeralKey:'c'.repeat(87),salt:'d'.repeat(43),iv:'e'.repeat(16),ciphertext:'f'.repeat(100),signature:'g'.repeat(86) }
  let store = new RelayStore(path)
  try {
    await store.initialize()
    await store.db.run('INSERT INTO pairs VALUES (?,?,?,?,0)',e.pairId,e.senderId,e.recipientId,'{}')
    assert.equal(await store.enqueue(e,now),'queued')
    await store.close(); store = new RelayStore(path); await store.initialize()
    assert.equal(await store.enqueue(e,now),'queued')
    assert.equal((await store.inbox(e.recipientId,now)).length,1)
    await assert.rejects(() => store.enqueue({...e,ciphertext:'changed'},now), /Idempotency/)
    await assert.rejects(() => store.receipt(e.id,'unpaired','received',now), /unavailable/)
    await store.receipt(e.id,e.recipientId,'received',now+1)
    await store.receipt(e.id,e.recipientId,'continued',now+2)
    assert.equal(await store.enqueue(e,now+3),'continued')
    assert.equal((await store.inbox(e.recipientId,now+3)).length,1)
    await store.cleanup(now+60001)
    assert.equal((await store.inbox(e.recipientId,now+60001)).length,0)
    assert.equal((await store.db.get('SELECT count(*) n FROM envelopes'))!.n,0)
    await assert.rejects(() => store.enqueue(e,now+60001),/expired/)
  } finally { await store.close(); rmSync(directory,{recursive:true,force:true}) }
})
