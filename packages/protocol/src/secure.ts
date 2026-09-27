import { z } from 'zod'
z.config({ jitless: true })

export const RETENTION_MS = 7 * 24 * 60 * 60 * 1000
export const INVITATION_MS = 5 * 60 * 1000
export const MAX_CARD_BYTES = 32 * 1024
export const uuidSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
export const binary = (length: number) => z.string().length(length).regex(/^[A-Za-z0-9_-]+$/)
export const deviceIdSchema = binary(43)
export const bundleSchema = z.strictObject({ id: deviceIdSchema, signingKey: binary(87), agreementKey: binary(87) })
export type PublicDevice = z.infer<typeof bundleSchema>
export const envelopeSchema = z.strictObject({
  version: z.literal(1), suite: z.literal('P256-HKDF-SHA256-A256GCM'),
  id: uuidSchema, pairId: uuidSchema, senderId: deviceIdSchema, recipientId: deviceIdSchema,
  createdAt: z.number().int().nonnegative(), expiresAt: z.number().int().nonnegative(),
  ephemeralKey: binary(87), salt: binary(43), iv: binary(16),
  ciphertext: z.string().min(23).max(43712).regex(/^[A-Za-z0-9_-]+$/), signature: binary(86),
})
export type Envelope = z.infer<typeof envelopeSchema>
export const invitationSchema = z.strictObject({
  version: z.literal(1), id: uuidSchema, origin: z.string().max(256),
  inviter: bundleSchema, expiresAt: z.number().int().nonnegative(),
  secret: binary(43), signature: binary(86),
})
export type Invitation = z.infer<typeof invitationSchema>
export const pairSchema = z.strictObject({
  id: uuidSchema, origin: z.string().max(256), expiresAt: z.number().int().nonnegative(),
  inviter: bundleSchema, joiner: bundleSchema,
  inviterSignature: binary(86).nullable(), joinerSignature: binary(86).nullable(),
  active: z.boolean(),
})
export type Pair = z.infer<typeof pairSchema>
export type Receipt = 'queued' | 'received' | 'continued'
export const receiptSchema = z.enum(['received', 'continued'])

export function envelopeHeader(e: Envelope | Omit<Envelope, 'ciphertext' | 'signature'>): string {
  return JSON.stringify([e.version,e.suite,e.id,e.pairId,e.senderId,e.recipientId,e.createdAt,e.expiresAt,e.ephemeralKey,e.salt,e.iv])
}
export function envelopeBytes(e: Envelope): string {
  return JSON.stringify([envelopeHeader(e),e.ciphertext,e.signature])
}
export function pairTranscript(p: Pick<Pair, 'id' | 'origin' | 'expiresAt' | 'inviter' | 'joiner'>): string {
  return JSON.stringify(['carry.pair.v1',p.origin,p.id,p.expiresAt,p.inviter.id,p.inviter.signingKey,p.inviter.agreementKey,p.joiner.id,p.joiner.signingKey,p.joiner.agreementKey])
}
export function invitationMessage(i: Pick<Invitation, 'id' | 'origin' | 'expiresAt' | 'inviter'>, secretHash: string): string {
  return JSON.stringify(['carry.invite.v1',i.origin,i.id,i.expiresAt,i.inviter.id,i.inviter.signingKey,i.inviter.agreementKey,secretHash])
}
export const jsonSchema = (schema: z.ZodType) => z.toJSONSchema(schema, { target: 'draft-7' })
export { z }
