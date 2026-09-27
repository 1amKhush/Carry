import assert from 'node:assert/strict'
import test from 'node:test'
import { validateCard, parseHttpUrl, type Card } from '../src/card.ts'

const card: Card = {
  id: crypto.randomUUID(), title: '', primaryUrl: 'https://example.com/task?q=17#comment-2',
  relatedUrls: ['http://localhost:8080/reference'], note: '', createdAt: new Date().toISOString(),
}

test('the shared runtime validator accepts a complete card and separate recipient', () => {
  assert.equal(validateCard(card), true)
})

test('rejects malformed card fields, limits, unknown properties, and non-web URLs', () => {
  const invalid = [
    { ...card, primaryUrl: 'javascript:alert(1)' },
    { ...card, primaryUrl: 'https://' },
    { ...card, primaryUrl: 'https:example.com' },
    { ...card, primaryUrl: ' https://example.com' },
    { ...card, primaryUrl: 'https://example.com/' + 'a'.repeat(2048) },
    { ...card, relatedUrls: ['data:text/html,bad'] },
    { ...card, relatedUrls: Array(4).fill('https://example.com') },
    { ...card, relatedUrls: 'https://example.com' },
    { ...card, title: 42 },
    { ...card, title: 'a'.repeat(121) },
    { ...card, note: 'a'.repeat(1001) },
    { ...card, createdAt: '2026-02-30T00:00:00.000Z' },
    { ...card, createdAt: 'yesterday' },
    { ...card, id: '1' },
    { ...card, recipientDeviceId: crypto.randomUUID() },
    { primaryUrl: card.primaryUrl },
  ]
  for (const candidate of invalid) assert.equal(validateCard(candidate), false, JSON.stringify(candidate))
})

test('form URL parsing shares the protocol format and preserves URL context', () => {
  assert.equal(parseHttpUrl(' https://example.com/task?q=17#comment-2 '), card.primaryUrl)
  assert.equal(parseHttpUrl('HTTP://EXAMPLE.COM'), 'http://example.com/')
  for (const value of ['', 'example.com', '/path', '//example.com', 'file:///tmp/a', 'ftp://example.com', 'mailto:hi@example.com']) {
    assert.equal(parseHttpUrl(value), null)
  }
})
