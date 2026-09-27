# Carry

A small card that carries a link and its context between paired browser profiles.

Milestone 3A–3C is implemented: durable SQLite/Turso delivery, key-backed identity, QR pairing with approval on both devices, client-encrypted cards, expiry, retries, and receipts. Render Free + Turso deployment configuration is included and the Turso integration has been verified. **Milestone 3D is not complete until the public deployment and actual-phone acceptance run are recorded.**

## Develop

Use Node.js 24 LTS and pnpm 10.34.5.

```sh
pnpm install
pnpm dev
```

Open **http://127.0.0.1:5173** in two different browser profiles. Both the Vite app and the API bind to loopback by default. Vite proxies /api to the API on port 3001. Use that exact origin, or configure CARRY_ORIGIN to match the browser address.

Choose **Pair device**, create an invitation, open its link in the other profile (or scan the QR on a reachable HTTPS deployment), compare all four verification-code groups, and approve on both screens. In **New card**, select the trusted device and send. **Inbox** polls every three seconds; **Continue** opens the original HTTP(S) destination in a new tab. No UUID copying remains.

The API stores data in apps/api/data/carry.sqlite during development. Stop and restart `pnpm dev` to verify durability. Keep the same profile and origin to retain browser keys. Milestone 2’s localStorage UUID is ignored; its plaintext development routes are removed.

## Capture a page

[Load the Carry extension in Chrome or Edge](apps/extension/README.md), then click **Carry this page** on an HTTP(S) tab. It opens the existing New card form with the exact URL and title. Review the draft, choose a paired device and press **Send**. Capturing never sends automatically. Drafts survive reload/navigation within the same tab; an incoming capture asks before replacing existing work.

Select a short passage on a desktop page and use **Carry selected text** in the right-click menu to prefill a reviewed excerpt. Add an optional goal and next action in New card. On the recipient, open the card from Inbox to see its dedicated **Resume** view: next action first, then context, Continue, related links and the original note. Older cards still open. See [0006 — resumable context](docs/decisions/0006-resumable-context.md).

The web app is installable. Android system sharing is an opt-in preview until [the real-phone acceptance check](docs/capture-acceptance.md) passes. `pnpm --filter @carry/web build --mode share-preview` enables it for testing; normal builds retain manual paste and desktop capture. See [the capture contract](docs/decisions/0005-page-capture.md).

## Optional AI resume help

On a received card, choose **Help me resume**. Connect your own OpenRouter account with OAuth PKCE or enter a personal key on that device. Review the exact card fields in the disclosure preview, then press **Approve and ask AI**. The default is `openrouter/free`; another model is used only if you explicitly select and enter it. A generated plan is local to the current screen and is not saved to the relay. **Disconnect and remove key** deletes the browser-stored key. The card and Continue link work even when AI is disconnected or unavailable.

Card plaintext goes directly from the receiving browser to OpenRouter and its selected model provider only after approval. The browser also sends fixed task-planning instructions; linked pages are not fetched or read. No OpenRouter key belongs in Render, Turso, Vite environment variables, or Git. See [0007 — optional AI](docs/decisions/0007-optional-ai.md) for the trust boundary and failure behavior.

## Verify

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm --filter @carry/web exec playwright install chromium
pnpm test:e2e
pnpm test:extension # Requires installed Chrome and Edge; build the web app first.
pnpm --filter @carry/api test:turso # Optional live test; needs ignored apps/api/.env.turso.local.
```

For an installed Chrome, use `CHROME_PATH=/usr/bin/google-chrome pnpm test:e2e`. Browser tests launch isolated API processes with temporary SQLite files. They use separate persistent profiles, stop/restart the real API, test exact-link Continue, lost-response retry, receipts, polling, Unpair, invalid URLs, and automated desktop/mobile accessibility. The browser suite builds with the share-preview flag and tests POST interception with a real service worker and an HTTP-boundary counter. Run `pnpm --filter @carry/web build` afterward to restore a default production build. Mobile emulation is not an actual-phone test.

See [the Turso/Render preparation verification](docs/verification-0004.md) and [the original local verification record](docs/verification-0003.md) for completed checks and their limits.

## Render + Turso deployment

Use [the Render deployment guide](docs/render-deployment.md) for the exact build/start commands and environment settings. [render.yaml](render.yaml) also supports Blueprint setup. Fastify serves the built app and API from one HTTPS origin; Turso retains data across service restarts. Set the two Turso values in Render's service environment. The API uses Render's HTTPS URL automatically.

The SQL schema is applied on startup. To explicitly migrate or verify the database using the ignored API credentials file:

```sh
pnpm --filter @carry/api db:migrate
pnpm --filter @carry/api test:turso
```

See [0004 — Render and Turso](docs/decisions/0004-render-turso.md) for transaction behavior and the limits of cloud verification.

## Alternative: Docker on a persistent-disk server

Copy .env.example to .env on a persistent-disk server and set CARRY_DOMAIN to its public DNS hostname. Then run:

```sh
docker compose up -d --build
docker compose ps
```

Caddy serves HTTPS; the API container is private. Named volumes retain SQLite and TLS state. Do not delete the volumes during redeployment. See [deployment and actual-device acceptance](docs/real-device-acceptance.md).

Configuration:
- TURSO_DATABASE_URL / TURSO_AUTH_TOKEN: select remote libSQL storage; API-only secrets. Required on Render.
- CARRY_ORIGIN: exact external origin, HTTPS required except loopback. Defaults to RENDER_EXTERNAL_URL on Render, otherwise http://127.0.0.1:5173.
- CARRY_DB_PATH: SQLite file. Development default: ./data/carry.sqlite from the API working directory.
- PORT: platform-provided port; also binds to 0.0.0.0. CARRY_API_PORT defaults to 3001 when PORT is absent.
- CARRY_API_HOST: default 127.0.0.1; the container binds 0.0.0.0 on its private network.
- CARRY_SERVE_WEB=1: serve the built web app with a restrictive CSP.

A phone’s 127.0.0.1 points to the phone. Use the same reachable HTTPS hostname on both devices.

## Security and delivery contract

The relay receives versioned encrypted envelopes, never a plaintext Card. Shared Zod schemas validate cards in the browser and envelope shapes at the API. P-256 ECDSA authenticates devices and signs pairing approvals/envelopes. Fresh ephemeral P-256 ECDH, HKDF-SHA-256, and AES-256-GCM encrypt each card for its recipient. Private keys are non-extractable CryptoKeys in IndexedDB. Session tokens remain in memory; the relay stores their hashes. Requests require a session and an active pair.

**Queued** means the database committed. **Received** means the recipient decrypted, validated, and saved the envelope locally. **Continued** means Continue was pressed, not that the destination finished loading. Receipts never delete the envelope. Cards expire after seven days; cleanup runs on startup and at most once a minute while the service is awake; reads always filter expiry. Retries reuse a locally saved envelope and ID. Unpair revokes the pair and removes its queued/local envelopes.

Clearing a browser profile’s site data loses its keys and requires pairing again. Browser encryption protects stored relay data; malicious code served to the browser can still use its keys. The cryptographic format has tests but has not received an independent security audit. Routing, timing, ciphertext size, public keys, and receipt states remain visible to the relay. This small relay has a 1,000-device registration cap, a 10,000-envelope queue cap, and request rate limits; it is not a multi-tenant service.

See [0003 — secure handoff](docs/decisions/0003-secure-handoff.md) for exact byte formats, signing transcripts, trust rules, retention and limitations.

## Workspace

- apps/web — card editor, pairing, Inbox, local keys/envelopes, delivery states.
- apps/api — authenticated Fastify relay, SQLite/Turso, pairing, expiry, receipts, production static serving.
- apps/extension — Chrome/Edge toolbar capture through activeTab.
- packages/protocol — Card, exact URL and versioned envelope validation.
- packages/crypto — browser-compatible crypto primitives and format tests.
- docs/decisions — implementation decisions.

Native share extensions and notifications remain later milestones. Optional AI resume help is available on received cards.
