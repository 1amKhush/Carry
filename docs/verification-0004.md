# Render / Turso verification — 2026-09-27

Completed locally and against the configured Turso libSQL database. No Render service was created or deployed, and no actual-phone run is claimed.

| Check | Result |
| --- | --- |
| `pnpm --filter @carry/api db:migrate` | Applied the shared idempotent schema to Turso successfully. |
| Read-only cloud schema inspection | Seven tables, ten explicit indexes, and primary keys on both `envelopes.id` and `dedupe.id` confirmed. |
| `pnpm --filter @carry/api test:turso` | Passed against Turso: authenticated pairing and concurrent approvals, four concurrent identical sends producing one row, conflicting retry rejection, unauthorized inbox/receipt rejection, plaintext request rejection, encrypted payload privacy, delivery/decryption after closing and recreating API/client instances, monotonic retained receipts, expiry filtering, send/Unpair race, and single-use challenge race. |
| `pnpm install --frozen-lockfile --prod=false` | Passed with the workspace lockfile. |
| `pnpm build`, `pnpm typecheck`, `pnpm lint` | Passed with Node 24.21.0 and pnpm 10.34.5. |
| `pnpm test` | 17 tests passed, including local physical expiry cleanup, rollback/isolation, Render configuration and production route handling. |
| `CHROME_PATH=/usr/bin/google-chrome pnpm test:e2e` | Ten tests passed across desktop and mobile Chromium configurations, including separate persistent profiles, recipient closure, real local API process restart and exact-URL Continue. |
| Test environment isolation | One additional browser restart/delivery test passed with deliberately invalid exported Turso/Render settings; its child API uses only its temporary local database. |
| Production process smoke | Started the actual server with `NODE_ENV=production`, `PORT` and a temporary local SQLite file. Verified the `0.0.0.0` listening socket, database health, built HTML/JS, browser fallback, CSP and JSON API 404s. Stopped that test process afterward. |
| Credential checks | API local credentials file is Git-ignored and mode 0600; the provided token is absent from publishable source and the built web assets. Docker excludes nested environment files. |

The live test disables automatic global expiry cleanup and removes only its generated identities/records. It inserts and deletes one expired fixture by its own ID to check cloud expiry filtering. The unrestricted production cleanup sweep is tested only against temporary local databases. The cloud test does not inspect other users' card payloads.

The production smoke checks the listening socket directly; Fastify's advertised URL can use a loopback address even when the socket binds all interfaces.

Next: push the repo, configure [Render](render-deployment.md), then complete [actual-device acceptance](real-device-acceptance.md). Mobile browser emulation and API injection tests do not replace a real phone on the public HTTPS origin.
