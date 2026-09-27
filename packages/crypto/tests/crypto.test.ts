import assert from 'node:assert/strict'
import test from 'node:test'
import { generateIdentity, encryptCard, decryptCard, hash, sign, verificationCode, approvalMessage, verifyPair } from '../src/index.ts'
import type { Pair } from '@carry/protocol/secure'

test('non-extractable identity keys; signed envelope round trip and independent fresh encryption', async () => {
  const a=await generateIdentity(), b=await generateIdentity()
  for(const key of [a.signingPrivate,a.agreementPrivate]) {
    assert.equal(key.extractable,false)
    await assert.rejects(crypto.subtle.exportKey('jwk',key))
  }
  const card={id:crypto.randomUUID(),title:'Private title',primaryUrl:'https://example.com/task?q=17#exact',relatedUrls:[],note:'Secret note',createdAt:new Date().toISOString()}
  const pairId=crypto.randomUUID()
  const one=await encryptCard(a,b.public,pairId,card), two=await encryptCard(a,b.public,pairId,card)
  assert.notEqual(one.ephemeralKey,two.ephemeralKey)
  assert.notEqual(one.iv,two.iv)
  assert.notEqual(one.ciphertext,two.ciphertext)
  assert.deepEqual(await decryptCard(b,a.public,pairId,one),card)
  for (const text of [card.title,card.note,card.primaryUrl]) assert.equal(JSON.stringify(one).includes(text),false)
  for (const modified of [{...one,iv:two.iv},{...one,ciphertext:two.ciphertext},{...one,expiresAt:one.expiresAt+1},{...one,recipientId:a.public.id}]) {
    await assert.rejects(decryptCard(b,a.public,pairId,modified))
  }
  await assert.rejects(decryptCard(a,a.public,pairId,one))
  await assert.rejects(decryptCard(b,a.public,crypto.randomUUID(),one))
  await assert.rejects(decryptCard(b,a.public,pairId,one,one.expiresAt))
})

test('pair approval signatures and verification code bind both full key bundles', async () => {
  const a=await generateIdentity(), b=await generateIdentity(), attacker=await generateIdentity()
  const pair:Pair={id:crypto.randomUUID(),origin:'https://carry.example',expiresAt:Date.now()+300000,inviter:a.public,joiner:b.public,active:true,inviterSignature:null,joinerSignature:null}
  const message=await approvalMessage(pair)
  pair.inviterSignature=await sign(a,message); pair.joinerSignature=await sign(b,message)
  assert.equal(await verifyPair(pair),true)
  const modified={...pair,joiner:attacker.public}
  assert.equal(await verifyPair(modified),false)
  assert.notEqual(await verificationCode(pair),await verificationCode(modified))
  assert.notEqual(await hash('a'),await hash('b'))
})

test('v1 envelope interoperates with independent Node ECDH, HKDF, AES-GCM and P1363 verification',async()=>{
  const {createECDH,hkdfSync,createDecipheriv,createPublicKey,verify:nodeVerify}=await import('node:crypto')
  const {deviceFingerprint}=await import('../src/index.ts')
  // Fixed receiver scalar is a test fixture only, never a production identity.
  const d=Buffer.alloc(32);d[31]=1
  const receiver=createECDH('prime256v1');receiver.setPrivateKey(d)
  const point=receiver.getPublicKey()
  const keys={signingKey:point.toString('base64url'),agreementKey:point.toString('base64url')}
  const recipient={...keys,id:await deviceFingerprint(keys)}
  const sender=await generateIdentity(),pairId=crypto.randomUUID()
  const card={id:crypto.randomUUID(),title:'Independent format test',primaryUrl:'https://example.com/a?x=%2F#b',relatedUrls:[],note:'UTF-8: café → 完了',createdAt:new Date().toISOString()}
  const e=await encryptCard(sender,recipient,pairId,card)
  const shared=receiver.computeSecret(Buffer.from(e.ephemeralKey,'base64url'))
  const info=Buffer.from(JSON.stringify(['carry.key.v1',e.senderId,e.recipientId,e.pairId,e.id]))
  const key=hkdfSync('sha256',shared,Buffer.from(e.salt,'base64url'),info,32)
  const aad=JSON.stringify([1,'P256-HKDF-SHA256-A256GCM',e.id,e.pairId,e.senderId,e.recipientId,e.createdAt,e.expiresAt,e.ephemeralKey,e.salt,e.iv])
  const ciphertext=Buffer.from(e.ciphertext,'base64url')
  const decipher=createDecipheriv('aes-256-gcm',Buffer.from(key),Buffer.from(e.iv,'base64url'))
  decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(ciphertext.subarray(-16))
  const plaintext=Buffer.concat([decipher.update(ciphertext.subarray(0,-16)),decipher.final()])
  assert.deepEqual(JSON.parse(plaintext.toString('utf8')),card)
  const signingPoint=Buffer.from(sender.public.signingKey,'base64url')
  const publicKey=createPublicKey({key:{kty:'EC',crv:'P-256',x:signingPoint.subarray(1,33).toString('base64url'),y:signingPoint.subarray(33).toString('base64url')},format:'jwk'})
  assert.equal(nodeVerify('sha256',Buffer.from(JSON.stringify(['carry.envelope.v1',aad,e.ciphertext])),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(e.signature,'base64url')),true)
})
