# Local verification — milestone 3

Run on 2026-09-27 using Node 24.21.0, pnpm 10.34.5, and Chromium.

- `pnpm test`: 14 passing tests across protocol, crypto, API, and web helpers.
- `pnpm typecheck`: passes for all workspace packages.
- `pnpm lint`: passes.
- Production build: passes locally and in Docker.
- `CHROME_PATH=/usr/bin/google-chrome pnpm test:e2e`: 10 passing tests across desktop and mobile Chromium layouts. A subsequent targeted run confirms the lint-only fixture callback rename.

The browser suite pairs separate profiles with matching verification codes and two approvals. It closes the receiving profile, sends, closes the sender, stops/restarts the actual API process with the same SQLite file, reopens the receiver, checks the exact Continue URL, and observes Continued at the sender. It also checks both retry paths (saved send after reload, retained form after delayed confirmation), live polling, receipt retention, Unpair, invalid URLs, tampered QR signatures and ciphertext, profile data loss, keyboard navigation, and automated WCAG checks.

Crypto tests additionally decrypt a Web Crypto envelope with independent Node ECDH/HKDF/AES-GCM APIs and verify its P1363 signature. API tests cover unauthorized inbox/receipt requests, replayed/expired authentication challenges, both pairing approvals, expired invitations, queue deduplication/conflicts, SQLite restart, plaintext absence in the database, and physical expiry cleanup.

## Container and HTTPS smoke test

Built `carry:milestone3` and ran the relay as its non-root user with a read-only root filesystem and a Docker named volume. Put it behind the repository Caddyfile on loopback HTTPS. Verified the local CA certificate explicitly with `NODE_EXTRA_CA_CERTS` / `curl --cacert`; certificate checking was not disabled.

Through HTTPS: registered two key-backed identities, authenticated, exchanged a signed invitation and two approvals, queued an encrypted card, retried it byte-for-byte, restarted the relay container, decrypted the one retained envelope, sent Received and Continued receipts, and checked retention. Queried SQLite inside the container: one encrypted envelope, no plaintext title/URL/note sentinels. CSP and HSTS headers were present.

This verifies local TLS and container persistence. It does **not** establish public reachability, camera QR scanning on a physical phone, Safari behavior, or delivery across real networks. Public hostname and actual-phone evidence remain pending in [the 3D acceptance record](real-device-acceptance.md). No independent security audit has been performed.
