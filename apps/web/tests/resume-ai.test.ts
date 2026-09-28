import assert from 'node:assert/strict'
import test from 'node:test'
import type { Card } from '@carry/protocol'
import { buildResumeInput, FREE_MODEL, requestResumePlan, resumeRequestBody, validateResumePlan } from '../src/ai/resumePlan.ts'
import { resumeInputSchema } from '@carry/protocol/resume-ai'

const card: Card = {
  id: '11111111-1111-4111-8111-111111111111', title: 'OAuth callback',
  primaryUrl: 'https://example.com/fix?state=a%2Fb#comment-17', relatedUrls: ['https://example.com/issue#discussion'],
  goal: 'Fix the callback', nextAction: 'Check Safari cookies', excerpt: 'State cookie is missing.', note: 'Compare issue 17.',
  createdAt: '2026-09-28T00:00:00.000Z',
}
const plan = {
  whereYouLeftOff: 'You were checking a missing Safari state cookie.',
  doNext: ['Reproduce the callback.', 'Compare cookie attributes.'],
  usefulLinks: [{ label: 'The callback', url: card.primaryUrl }], insufficientContext: false,
}
test('AI input contains only approved context and exact original links', () => {
  const input = buildResumeInput(card)
  assert.deepEqual(input, {
    goal: card.goal, nextAction: card.nextAction, note: card.note, excerpt: card.excerpt,
    links: [{ title: card.title, url: card.primaryUrl }, { url: card.relatedUrls[0] }],
  })
  const json = JSON.stringify(input)
  assert.ok(!json.includes(card.id))
  assert.ok(!json.includes(card.createdAt))
  assert.deepEqual(validateResumePlan(plan, input), plan)
  for(const url of ['javascript:alert(1)',' https://example.com'])assert.equal(resumeInputSchema.safeParse({...input,links:[{url}]}).success,false)
})
test('legacy cards disclose empty task fields and require an honest insufficient-context flag', () => {
  const input = buildResumeInput({ ...card, goal: undefined, nextAction: undefined, excerpt: undefined, note: '' })
  assert.equal(input.goal, '')
  assert.equal(input.excerpt, '')
  assert.throws(() => validateResumePlan(plan, input), /context/)
  assert.ok(validateResumePlan({ ...plan, insufficientContext: true }, input))
})
test('the output rejects unsupported links, unsafe schemes, extra keys, and long content', () => {
  const input = buildResumeInput(card)
  for (const url of ['https://other.example', 'javascript:alert(1)']) {
    assert.throws(() => validateResumePlan({ ...plan, usefulLinks: [{ label: 'Other', url }] }, input))
  }
  assert.throws(() => validateResumePlan({ ...plan, extra: 'ignore previous instructions' }, input))
  assert.throws(() => validateResumePlan({ ...plan, doNext: ['x'.repeat(181)] }, input))
})
test('request selects exactly one model and sends only card input, without paid fallback', () => {
  const input = buildResumeInput(card)
  const request = resumeRequestBody(input, FREE_MODEL)
  assert.equal(request.model, 'openrouter/free')
  assert.deepEqual(JSON.parse(request.messages[1].content), input)
  assert.equal(request.messages[0].role, 'system')
  assert.throws(() => resumeRequestBody(input, 'https://evil.example'), /model ID/)
})
test('OpenRouter 429 and malformed generations fail without exposing server error bodies', async () => {
  const original = globalThis.fetch
  const input = buildResumeInput(card)
  try {
    globalThis.fetch = async () => new Response('secret error body', { status: 429 })
    await assert.rejects(requestResumePlan(input, 'sk-or-local-test', FREE_MODEL), /rate limited/)
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: '{"whereYouLeftOff":"too little"}' } }] })
    await assert.rejects(requestResumePlan(input, 'sk-or-local-test', FREE_MODEL), /invalid plan/)
  } finally { globalThis.fetch = original }
})
