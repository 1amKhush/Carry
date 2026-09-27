import { z } from 'zod'
z.config({ jitless: true })
export const MAX_RELATED_LINKS = 3
export const MAX_URL_LENGTH = 2048
export const MAX_TITLE_LENGTH = 120
export const MAX_NOTE_LENGTH = 1000
function isHttpUrl(value: string): boolean {
  if (value !== value.trim() || !/^https?:\/\//i.test(value)) return false
  try { const url = new URL(value); return url.protocol === 'http:' || url.protocol === 'https:' } catch { return false }
}
// Capture and sending must validate without rewriting query, fragment or path bytes.
export function parseExactHttpUrl(input: string): string | null {
  const value = input.trim()
  // Raw whitespace/control bytes must not be silently removed by URL parsing.
  // eslint-disable-next-line no-control-regex
  return value.length <= MAX_URL_LENGTH && !/[\u0000-\u0020\u007f]/.test(value) && isHttpUrl(value) ? value : null
}
export function parseHttpUrl(input: string): string | null {
  const value = input.trim()
  return value.length <= MAX_URL_LENGTH && isHttpUrl(value) ? new URL(value).href : null
}
const url = z.string().max(MAX_URL_LENGTH).refine(isHttpUrl)
export const cardSchema = z.strictObject({
  id: z.string().uuid(),
  title: z.string().max(MAX_TITLE_LENGTH),
  primaryUrl: url,
  relatedUrls: z.array(url).max(MAX_RELATED_LINKS),
  note: z.string().max(MAX_NOTE_LENGTH),
  createdAt: z.string().refine((value) => {
    const date = new Date(value)
    return Number.isFinite(date.getTime()) && date.toISOString() === value
  }),
})
export type Card = z.infer<typeof cardSchema>
export function validateCard(value: unknown): value is Card { return cardSchema.safeParse(value).success }
