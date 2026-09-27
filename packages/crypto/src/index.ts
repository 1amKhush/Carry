import { validateCard, type Card } from '@carry/protocol'
import {
  bundleSchema, envelopeSchema, envelopeHeader, pairTranscript, invitationMessage,
  MAX_CARD_BYTES, RETENTION_MS, type PublicDevice, type Envelope, type Pair, type Invitation,
} from '@carry/protocol/secure'

const utf8 = new TextEncoder()
export interface Identity { public: PublicDevice; signingPrivate: CryptoKey; agreementPrivate: CryptoKey }
export function base64url(value: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(value instanceof Uint8Array ? value : value)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
}
export function bytes(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid binary encoding.')
  const decoded = Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')), (c) => c.charCodeAt(0))
  if (base64url(decoded) !== value) throw new Error('Non-canonical binary encoding.')
  return decoded
}
export const randomToken = () => base64url(crypto.getRandomValues(new Uint8Array(32)))
export async function hash(value: string): Promise<string> { return base64url(await crypto.subtle.digest('SHA-256',utf8.encode(value))) }
export const deviceFingerprint = (p: Pick<PublicDevice,'signingKey'|'agreementKey'>) => hash(JSON.stringify(['carry.device.v1',p.signingKey,p.agreementKey]))
export async function generateIdentity(): Promise<Identity> {
  const signing = await crypto.subtle.generateKey({ name:'ECDSA',namedCurve:'P-256' },false,['sign','verify'])
  const agreement = await crypto.subtle.generateKey({ name:'ECDH',namedCurve:'P-256' },false,['deriveBits'])
  const keys = {
    signingKey:base64url(await crypto.subtle.exportKey('raw',signing.publicKey)),
    agreementKey:base64url(await crypto.subtle.exportKey('raw',agreement.publicKey)),
  }
  return { public:{...keys,id:await deviceFingerprint(keys)},signingPrivate:signing.privateKey,agreementPrivate:agreement.privateKey }
}
export async function validatePublicDevice(value: unknown): Promise<PublicDevice> {
  const p = bundleSchema.parse(value)
  if (await deviceFingerprint(p) !== p.id) throw new Error('Device fingerprint mismatch.')
  await Promise.all([
    crypto.subtle.importKey('raw',bytes(p.signingKey),{name:'ECDSA',namedCurve:'P-256'},false,['verify']),
    crypto.subtle.importKey('raw',bytes(p.agreementKey),{name:'ECDH',namedCurve:'P-256'},false,[]),
  ])
  return p
}
export async function sign(identity: Identity, message: string): Promise<string> {
  return base64url(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},identity.signingPrivate,utf8.encode(message)))
}
export async function verify(device: PublicDevice, message: string, signature: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey('raw',bytes(device.signingKey),{name:'ECDSA',namedCurve:'P-256'},false,['verify'])
    const raw = bytes(signature)
    return raw.length === 64 && await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,raw,utf8.encode(message))
  } catch { return false }
}
export const approvalMessage = async (pair: Pair) => JSON.stringify(['carry.approve.v1',await hash(pairTranscript(pair))])
export async function verificationCode(pair: Pair): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256',utf8.encode(pairTranscript(pair)))
  const hex = Array.from(new Uint8Array(digest).slice(0,8),(b) => b.toString(16).padStart(2,'0')).join('').toUpperCase()
  return hex.match(/.{4}/g)!.join(' ')
}
export async function verifyPair(pair: Pair): Promise<boolean> {
  await Promise.all([validatePublicDevice(pair.inviter),validatePublicDevice(pair.joiner)])
  const message = await approvalMessage(pair)
  return pair.active && Boolean(pair.inviterSignature && pair.joinerSignature) &&
    await verify(pair.inviter,message,pair.inviterSignature!) && await verify(pair.joiner,message,pair.joinerSignature!)
}
export async function verifyInvitation(invite: Invitation, origin: string): Promise<boolean> {
  await validatePublicDevice(invite.inviter)
  return invite.origin === origin && invite.expiresAt > Date.now() &&
    await verify(invite.inviter,invitationMessage(invite,await hash(invite.secret)),invite.signature)
}
async function encryptionKey(privateKey: CryptoKey, publicKey: string, e: Omit<Envelope,'ciphertext'|'signature'>): Promise<CryptoKey> {
  const peer = await crypto.subtle.importKey('raw',bytes(publicKey),{name:'ECDH',namedCurve:'P-256'},false,[])
  const shared = await crypto.subtle.deriveBits({name:'ECDH',public:peer},privateKey,256)
  const material = await crypto.subtle.importKey('raw',shared,'HKDF',false,['deriveKey'])
  return crypto.subtle.deriveKey({
    name:'HKDF',hash:'SHA-256',salt:bytes(e.salt),
    info:utf8.encode(JSON.stringify(['carry.key.v1',e.senderId,e.recipientId,e.pairId,e.id])),
  },material,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])
}
export async function encryptCard(identity: Identity, recipient: PublicDevice, pairId: string, card: Card): Promise<Envelope> {
  if (!validateCard(card)) throw new Error('Invalid card.')
  const plaintext = utf8.encode(JSON.stringify(card))
  if (plaintext.byteLength > MAX_CARD_BYTES) throw new Error('Card exceeds 32 KiB.')
  const ephemeral = await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},false,['deriveBits'])
  const header: Omit<Envelope,'ciphertext'|'signature'> = {
    version:1,suite:'P256-HKDF-SHA256-A256GCM',id:card.id,pairId,
    senderId:identity.public.id,recipientId:recipient.id,
    createdAt:Date.parse(card.createdAt),expiresAt:Date.parse(card.createdAt)+RETENTION_MS,
    ephemeralKey:base64url(await crypto.subtle.exportKey('raw',ephemeral.publicKey)),
    salt:randomToken(),iv:base64url(crypto.getRandomValues(new Uint8Array(12))),
  }
  const key = await encryptionKey(ephemeral.privateKey,recipient.agreementKey,header)
  const aad = envelopeHeader(header)
  const ciphertext = base64url(await crypto.subtle.encrypt({name:'AES-GCM',iv:bytes(header.iv),additionalData:utf8.encode(aad),tagLength:128},key,plaintext))
  const signature = await sign(identity,JSON.stringify(['carry.envelope.v1',aad,ciphertext]))
  return envelopeSchema.parse({...header,ciphertext,signature})
}
export async function verifyEnvelope(e: Envelope, sender: PublicDevice): Promise<boolean> {
  return e.senderId === sender.id && await verify(sender,JSON.stringify(['carry.envelope.v1',envelopeHeader(e),e.ciphertext]),e.signature)
}
export async function decryptCard(identity: Identity, sender: PublicDevice, pairId: string, input: Envelope, now = Date.now()): Promise<Card> {
  const e = envelopeSchema.parse(input)
  if (e.recipientId !== identity.public.id || e.pairId !== pairId || e.expiresAt <= now ||
      e.expiresAt > e.createdAt+RETENTION_MS || e.expiresAt <= e.createdAt ||
      !await verifyEnvelope(e,sender)) throw new Error('Envelope is expired, untrusted, or modified.')
  const key = await encryptionKey(identity.agreementPrivate,e.ephemeralKey,e)
  const plaintext = await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(e.iv),additionalData:utf8.encode(envelopeHeader(e)),tagLength:128},key,bytes(e.ciphertext))
  if (plaintext.byteLength > MAX_CARD_BYTES) throw new Error('Card exceeds 32 KiB.')
  const card: unknown = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plaintext))
  if (!validateCard(card) || card.id !== e.id || Date.parse(card.createdAt) !== e.createdAt) throw new Error('Decrypted card is invalid.')
  return card
}
