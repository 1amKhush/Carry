# 0004 — One Render service with Turso libSQL

Status: implemented and verified against the configured Turso database. Public deployment and actual-phone acceptance remain separate checks. This updates the storage/deployment choices in [0003](0003-secure-handoff.md); cryptographic transcripts and browser pairing are unchanged.

## Storage

The relay uses one async storage contract with two drivers: Node SQLite for local development/persistent-volume hosting, and `@libsql/client` for Turso. Setting `TURSO_DATABASE_URL` selects Turso; its token is API-only. Render startup requires both values so an omitted secret cannot silently route delivery to ephemeral local disk. The SQL schema is shared, repeatable, and applied before readiness. Existing local SQLite tables retain their column layout.

Write operations use transactions: a Turso `transaction('write')` obtains a write transaction; local SQLite uses `BEGIN IMMEDIATE` and serializes all operations on its connection until commit/rollback. Network and cryptographic work happen before the transaction where possible. The API awaits COMMIT before returning Queued. Device registration, invitation claims, both-party approvals, single-use challenges, send deduplication and receipts remain atomic across concurrent requests.

Send checks the current pair inside the same write transaction as inserting the envelope and dedupe hash. Unpair uses the same transaction boundary to revoke trust and remove that pair's envelopes. A concurrent send either commits before Unpair and gets removed, or sees the revoked pair and fails. Receipts also check active pairing inside their write transaction.

Envelope IDs and dedupe IDs are primary keys. Exact retries return the existing monotonic status; different bytes under an existing ID conflict. Received/Continued do not delete envelopes. Expiry is checked by reads and writes, independently of the cleanup sweep. The sweep runs at startup and at most once a minute on requests/timer; an idle Render service performs physical deletion when it wakes. Dedupe hashes remain for 30 days beyond envelope expiry.

## Hosting

Fastify serves the built React app and the API from one HTTPS origin. API and missing-asset errors stay JSON; extensionless browser navigation can fall back to `index.html`. The Vite proxy remains for development. Render's `PORT` selects a public `0.0.0.0` listener; otherwise the development listener stays on loopback. `RENDER_EXTERNAL_URL` is the default deployed origin; `CARRY_ORIGIN` overrides it for a stable custom domain. Database errors and credentials are not exposed in API responses.

The free service's local filesystem is not the source of truth. Turso stores only encrypted card envelopes plus the existing public identity, routing, timing, pairing/session and receipt metadata. Browser private keys remain in IndexedDB. Neither Turso credentials nor card plaintext enter the frontend build configuration.

## Verification boundaries

The opt-in live Turso test exercises pairing, authentication, parallel approvals, parallel retries, restart with fresh API/database connections, encrypted payload inspection, decryption to the exact URL, monotonic receipts, expiry filtering, send/Unpair races and single-use challenge races. Its cleanup touches only generated fixture identities. Automatic global cleanup is disabled for that test; the normal sweep is verified by the local API/storage tests. Browser tests cover the existing UI flow with temporary SQLite databases. An actual phone on the deployed HTTPS origin remains necessary for milestone 3D.

Sources: [libSQL transactions](https://docs.turso.tech/sdk/ts/reference), [Render environment](https://render.com/docs/environment-variables), [Render Free](https://render.com/docs/free).
