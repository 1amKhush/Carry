import { test, expect } from './relay.ts'
import { navigate, pair, primary, send } from './helpers.ts'

const dummyKey = 'sk-or-test000000000000000000000000000000'

test('AI requires an explicit approved disclosure and never passes the card or key through Carry', async ({ page, browser, relay }) => {
  const receiver = await browser.newContext()
  const b = await receiver.newPage()
  const aiRequests: { url: string; body: string; authorization: string }[] = []
  const carryRequests: string[] = []
  try {
    await b.route('https://openrouter.ai/api/v1/chat/completions', async route => {
      aiRequests.push({ url: route.request().url(), body: route.request().postData() ?? '', authorization: route.request().headers().authorization ?? '' })
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ whereYouLeftOff: 'You were fixing a Safari callback.', doNext: ['Check the state cookie.'], usefulLinks: [{ label: 'Original page', url: destination }], insufficientContext: false }) } }] }) })
    })
    b.on('request', request => { if (request.url().startsWith(relay.origin + '/api/')) carryRequests.push(request.postData() ?? '') })
    await pair(page, b, relay.origin)
    await navigate(page, 'New card')
    await primary(page).fill(destination)
    await page.getByLabel('Give it a name').fill('OAuth callback')
    await page.getByLabel('Goal').fill('Fix the callback')
    await page.getByLabel('Next action').fill('Check Safari cookies')
    await page.getByRole('button', { name: 'Add a relevant detail or selected passage' }).click()
    await page.getByLabel('Relevant detail').fill('State cookie missing.')
    await send(page).click()
    await expect(page.locator('.notice')).toContainText('Queued')
    await navigate(b, 'Inbox')
    await b.getByRole('link', { name: 'Resume OAuth callback' }).click()
    await b.getByRole('button', { name: 'Help me resume' }).click()
    await expect(b.getByLabel('Exact card data for OpenRouter')).toContainText(destination)
    await b.getByText('View fixed AI instructions').click()
    await expect(b.getByText(/You have not opened or read linked pages/)).toBeVisible()
    expect(aiRequests).toHaveLength(0)
    await b.getByLabel('Or enter your own OpenRouter API key').fill(dummyKey)
    await b.getByRole('button', { name: 'Save key' }).click()
    await expect(b.getByText('Connected on this device', { exact: true })).toBeVisible()
    expect(aiRequests).toHaveLength(0)
    await b.getByRole('button', { name: 'Approve and ask AI' }).click()
    await expect(b.getByRole('region', { name: 'AI resume plan' })).toContainText('Check the state cookie.')
    expect(aiRequests).toHaveLength(1)
    const sent = JSON.parse(aiRequests[0].body)
    expect(sent.model).toBe('openrouter/free')
    expect(JSON.parse(sent.messages[1].content)).toEqual(JSON.parse(await b.getByLabel('Exact card data for OpenRouter').innerText()))
    expect(aiRequests[0].authorization).toBe('Bearer ' + dummyKey)
    expect(aiRequests[0].url).not.toContain(dummyKey)
    expect(carryRequests.join('\n')).not.toContain(dummyKey)
    expect(carryRequests.join('\n')).not.toContain('Fix the callback')
    await b.getByLabel('Model').selectOption('other')
    await b.getByLabel('OpenRouter model ID').fill('openai/gpt-4o-mini')
    expect(aiRequests).toHaveLength(1)
    await b.getByRole('button', { name: 'Approve and ask AI' }).click()
    await expect(b.getByRole('region', { name: 'AI resume plan' })).toBeVisible()
    expect(JSON.parse(aiRequests[1].body).model).toBe('openai/gpt-4o-mini')
    await b.getByRole('button', { name: 'Disconnect and remove key' }).click()
    await expect(b.getByRole('button', { name: 'Approve and ask AI' })).toBeDisabled()
    await b.reload()
    await b.getByRole('button', { name: 'Help me resume' }).click()
    await expect(b.getByRole('button', { name: 'Approve and ask AI' })).toBeDisabled()
    await expect(b.getByRole('link', { name: /^Continue to/ })).toBeVisible()
  } finally { await receiver.close() }
})

const destination = 'https://example.com/fix?state=a%2Fb#comment-17'

test('rate limit and invalid model output leave Continue usable', async ({ page, browser, relay }) => {
  const receiver = await browser.newContext()
  const b = await receiver.newPage()
  try {
    await pair(page, b, relay.origin)
    await navigate(page, 'New card')
    await primary(page).fill(destination)
    await send(page).click()
    await navigate(b, 'Inbox')
    await b.getByRole('link', { name: /^Resume/ }).click()
    await b.getByRole('button', { name: 'Help me resume' }).click()
    await b.getByLabel('Or enter your own OpenRouter API key').fill(dummyKey)
    await b.getByRole('button', { name: 'Save key' }).click()
    await b.route('https://openrouter.ai/api/v1/chat/completions', route => route.fulfill({ status: 429, body: 'private diagnostics' }))
    await b.getByRole('button', { name: 'Approve and ask AI' }).click()
    await expect(b.getByText(/rate limited/)).toBeVisible()
    await expect(b.getByRole('link', { name: /^Continue to/ })).toHaveAttribute('href', destination)
    await b.unroute('https://openrouter.ai/api/v1/chat/completions')
    await b.route('https://openrouter.ai/api/v1/chat/completions', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: '{}' } }] }) }))
    await b.getByRole('button', { name: 'Approve and ask AI' }).click()
    await expect(b.getByText(/invalid plan/)).toBeVisible()
    await expect(b.getByRole('link', { name: /^Continue to/ })).toHaveAttribute('href', destination)
  } finally { await receiver.close() }
})

test('PKCE sign-in uses a per-attempt challenge, scrubs the callback code, and keeps the key local', async ({ page, browser, relay }) => {
  const receiver = await browser.newContext()
  const b = await receiver.newPage()
  let challenge = ''
  let exchange: { code: string; code_verifier: string; code_challenge_method: string } | undefined
  let aiCalls = 0
  let exchanges = 0
  try {
    await pair(page, b, relay.origin)
    await navigate(page, 'New card')
    await primary(page).fill(destination)
    await send(page).click()
    await navigate(b, 'Inbox')
    await b.getByRole('link', { name: /^Resume/ }).click()
    await b.getByRole('button', { name: 'Help me resume' }).click()
    await b.route('https://openrouter.ai/auth?*', async route => {
      const authorization = new URL(route.request().url())
      challenge = authorization.searchParams.get('code_challenge') ?? ''
      expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')
      const callback = new URL(authorization.searchParams.get('callback_url')!)
      expect(callback.origin).toBe(relay.origin)
      callback.searchParams.set('code', 'mock-authorization-code')
      await route.fulfill({ status: 302, headers: { Location: callback.href }, body: '' })
    })
    await b.route('https://openrouter.ai/api/v1/auth/keys', async route => {
      exchanges++
      exchange = route.request().postDataJSON()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ key: dummyKey }) })
    })
    await b.route('https://openrouter.ai/api/v1/chat/completions', route => { aiCalls++; return route.abort() })
    await b.getByRole('button', { name: 'Connect OpenRouter', exact: true }).click()
    await expect(b).toHaveURL(new RegExp(relay.origin.replaceAll('.', '\\.') + '/#resume/'))
    await b.getByRole('button', { name: 'Help me resume' }).click()
    await expect(b.getByText('Connected on this device', { exact: true })).toBeVisible()
    await expect(b.getByText('OpenRouter is connected on this device.')).toBeVisible()
    expect(b.url()).not.toContain('mock-authorization-code')
    expect(exchange?.code).toBe('mock-authorization-code')
    expect(exchange?.code_challenge_method).toBe('S256')
    const expected = await b.evaluate(async verifier => {
      const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
      return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    }, exchange!.code_verifier)
    expect(challenge).toBe(expected)
    expect(aiCalls).toBe(0)
    await b.reload()
    await b.getByRole('button', { name: 'Help me resume' }).click()
    await expect(b.getByText('Connected on this device', { exact: true })).toBeVisible()
    await b.goto(relay.origin + '/oauth/openrouter?state=forged&code=forged-code')
    await expect(b).toHaveURL(relay.origin + '/#inbox')
    expect(exchanges).toBe(1)
  } finally { await receiver.close() }
})
