export { MAX_RELATED_LINKS, parseHttpUrl } from '@carry/protocol'
export type { Card } from '@carry/protocol'

export function linkLabel(url: string): string {
  return new URL(url).hostname.replace(/^www\./, '')
}
