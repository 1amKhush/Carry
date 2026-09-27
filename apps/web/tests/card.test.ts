import assert from 'node:assert/strict'
import test from 'node:test'
import { linkLabel, parseHttpUrl } from '../src/card.ts'

test('accepts and normalizes HTTP(S) links without dropping destination context', () => {
  assert.equal(parseHttpUrl('  https://example.com/issue?q=17#comment-2  '), 'https://example.com/issue?q=17#comment-2')
  assert.equal(parseHttpUrl('HTTP://EXAMPLE.COM'), 'http://example.com/')
  assert.equal(parseHttpUrl('http://localhost:5173/task'), 'http://localhost:5173/task')
})

test('rejects blank, incomplete, relative, and executable or non-web URLs', () => {
  for (const input of ['', '  ', 'example.com', '/a/path', '//example.com', 'https://', 'https:example.com', 'https:/example.com', 'not a url', 'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'ftp://example.com', 'mailto:hello@example.com', 'blob:https://example.com/id']) {
    assert.equal(parseHttpUrl(input), null, input)
  }
})

test('uses the hostname as a readable fallback without rewriting stored URLs', () => {
  assert.equal(linkLabel('https://www.example.com/a/path'), 'example.com')
  assert.equal(linkLabel('https://docs.example.com/a/path'), 'docs.example.com')
})
