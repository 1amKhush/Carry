import { openDB, type DBSchema } from 'idb'

const API_ORIGIN = 'https://openrouter.ai'
const PENDING_KEY = 'carry-openrouter-pkce-v1'
const NOTICE_KEY = 'carry-openrouter-notice-v1'
const CALLBACK_PATH = '/oauth/openrouter'
const MAX_PENDING_MS = 10 * 60 * 1000

interface AiDB extends DBSchema { credentials: { key: string; value: string } }
const database = () => openDB<AiDB>('carry-ai-v1', 1, { upgrade(db) { db.createObjectStore('credentials') } })
export async function getOpenRouterKey(): Promise<string | undefined> { return (await database()).get('credentials', 'openrouter') }
export async function saveOpenRouterKey(key: string): Promise<void> {
  const value = key.trim()
  if (!/^sk-or-[A-Za-z0-9_-]{20,500}$/.test(value)) throw new Error('Enter a valid OpenRouter API key.')
  await (await database()).put('credentials', value, 'openrouter')
}
export async function disconnectOpenRouter(): Promise<void> { await (await database()).delete('credentials', 'openrouter') }

function base64url(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
export async function beginOpenRouterOAuth(): Promise<void> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))))
  const state = base64url(crypto.getRandomValues(new Uint8Array(24)))
  const returnTo = /^#resume\/[0-9a-f-]{36}$/.test(location.hash) ? location.hash : '#inbox'
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state, returnTo, createdAt: Date.now() }))
  const callback = new URL(CALLBACK_PATH, location.origin)
  callback.searchParams.set('state', state)
  const authorization = new URL('/auth', API_ORIGIN)
  authorization.searchParams.set('callback_url', callback.href)
  authorization.searchParams.set('code_challenge', challenge)
  authorization.searchParams.set('code_challenge_method', 'S256')
  location.assign(authorization.href)
}

export function readOpenRouterNotice(): string {
  try { return sessionStorage.getItem(NOTICE_KEY) ?? '' } catch { return '' }
}
export function clearOpenRouterNotice(): void {
  try { sessionStorage.removeItem(NOTICE_KEY) } catch { /* Browser storage may be blocked. */ }
}

// Called before mounting React or starting any Carry request. OAuth codes never remain in browser history.
export async function finishOpenRouterOAuth(): Promise<void> {
  if (location.pathname !== CALLBACK_PATH) return
  const callback = new URL(location.href)
  const raw = sessionStorage.getItem(PENDING_KEY)
  sessionStorage.removeItem(PENDING_KEY)
  let pending: { verifier: string; state: string; returnTo: string; createdAt: number } | undefined
  try { pending = raw ? JSON.parse(raw) : undefined } catch { /* Invalid pending state is rejected below. */ }
  const returnTo = pending && /^#resume\/[0-9a-f-]{36}$/.test(pending.returnTo) ? pending.returnTo : '#inbox'
  history.replaceState(null, '', '/' + returnTo)
  let notice = 'OpenRouter connection was not completed. Try Connect OpenRouter again.'
  if (pending && typeof pending.verifier === 'string' && pending.state === callback.searchParams.get('state') &&
      Number.isFinite(pending.createdAt) && Date.now() - pending.createdAt < MAX_PENDING_MS &&
      Date.now() >= pending.createdAt && callback.searchParams.has('code')) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15_000)
      try {
        const response = await fetch(API_ORIGIN + '/api/v1/auth/keys', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: callback.searchParams.get('code'), code_verifier: pending.verifier, code_challenge_method: 'S256' }),
          credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal,
        })
        if (!response.ok) throw new Error('Exchange failed')
        const result: unknown = await response.json()
        if (!result || typeof result !== 'object' || !('key' in result) || typeof result.key !== 'string') throw new Error('Invalid response')
        await saveOpenRouterKey(result.key)
        notice = 'OpenRouter is connected on this device.'
      } finally { clearTimeout(timeout) }
    } catch { notice = 'Could not finish connecting OpenRouter. Try again or enter your key manually.' }
  }
  sessionStorage.setItem(NOTICE_KEY, notice)
}
