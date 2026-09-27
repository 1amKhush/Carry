# 0003 — Secure handoff v1

Status: implementation contract; not a claim of independent cryptographic review. Milestone 3D requires a configured public HTTPS origin and an actual-phone acceptance run.

## Durable relay (3A)
The hosted storage choice is updated by [0004 — Render and Turso](0004-render-turso.md); the contract below still applies.
SQLite on a persistent volume, WAL journaling, synchronous FULL, prepared statements, and transactions. Queue acceptance is returned only after COMMIT. The envelope UUID is the idempotency key. An identical retry returns the existing acceptance; changing any authenticated bytes under that ID conflicts. Dedupe hashes outlive ciphertext by 30 days. Envelopes remain until their signed expiry (maximum seven days), even after receipts. Cleanup runs on startup and at most once per minute on requests/timer; reads independently filter expired rows.

## Identity and sessions (3B)
Each browser stores separate non-extractable P-256 ECDSA and ECDH private CryptoKeys in IndexedDB. Public keys are uncompressed 65-byte SEC1 points, base64url without padding. Device ID is base64url SHA-256 of UTF-8 JSON ["carry.device.v1", signingPublicKey, agreementPublicKey]. Registration never replaces keys for an ID.
Authentication signs ["carry.auth.v1", origin, deviceId, challengeId, nonce, expiresAt] using ECDSA P-256/SHA-256. Challenges expire in 60 seconds and are consumed atomically once. Sessions use random 256-bit bearer tokens, only token hashes are stored on the relay, and expire after 24 hours. Browser tokens stay in memory. Inbox identity comes from authentication, never a supplied UUID.

Invitations last five minutes. The QR is a same-origin URL fragment containing invitation ID, inviter's full public-key bundle, secret, expiry, origin and signature. The secret is 256 random bits; only its SHA-256 hash is retained on the relay. The signature covers ["carry.invite.v1", origin, id, expiresAt, inviter.id, inviter.signingKey, inviter.agreementKey, secretHash].
Joining requires the secret and authentication; only one joiner may claim an invitation. The joiner pins the inviter keys from the QR. Both screens compute a 64-bit verification code from SHA-256 of the ordered transcript ["carry.pair.v1", origin, invitationId, expiresAt, inviter.id, inviter.signingKey, inviter.agreementKey, joiner.id, joiner.signingKey, joiner.agreementKey]. Compare all four groups before approving.
Each device signs ["carry.approve.v1", transcriptDigest]. Neither side becomes trusted until both signatures verify. Trust is pinned locally, and the API requires an active pair for sending, receiving and acknowledging. An unpair revokes that pair generation and its queued envelopes; a new pairing has a new pair ID. Locally revoked pair IDs cannot be restored by replaying old approvals.

## Envelope and encryption (3C)
All binary fields are canonical unpadded base64url. JSON headers are encoded as ordered arrays, not object-property iteration. v1 envelope fields:
- version: 1; suite: P256-HKDF-SHA256-A256GCM
- id: UUID v4; pairId: invitation UUID; senderId and recipientId: device fingerprints
- createdAt and expiresAt: integer Unix milliseconds
- ephemeralKey: fresh P-256 ECDH public point; salt: 32 random bytes; iv: 12 random bytes
- ciphertext: AES-256-GCM ciphertext followed by its 16-byte tag, at most 32 KiB plaintext
- signature: ECDSA P-256/SHA-256 over ["carry.envelope.v1", AAD string, ciphertext], IEEE-P1363 64-byte r||s

AAD is UTF-8 JSON [version,suite,id,pairId,senderId,recipientId,createdAt,expiresAt,ephemeralKey,salt,iv].
ECDH uses a fresh per-envelope ephemeral sender private key and the recipient's pinned long-term agreement key. HKDF-SHA-256 uses that 256-bit shared secret, the envelope salt, and UTF-8 JSON ["carry.key.v1",senderId,recipientId,pairId,id] to derive a non-extractable AES-256 key. Each derived key encrypts exactly one message with a random 96-bit IV. Retries reuse the same saved envelope; they never encrypt again under the same idempotency attempt.
The sender signature binds the ephemeral key and routing metadata to its pinned signing key. The recipient checks signature, identities, active pair generation and expiry, decrypts, validates Card, and requires card.id/createdAt to match the envelope. Invalid ciphertext never becomes a received receipt.
This provides confidentiality for relay storage, not forward secrecy after compromise of a recipient's long-term decryption key. The relay sees routing, timing, sizes, public keys and receipts. A compromised server can deny delivery. Malicious browser JavaScript can use even non-extractable keys; trusted HTTPS hosting, a restrictive CSP and security review remain necessary.

## Delivery and local persistence
Queued: the relay committed the envelope.
Received: the recipient decrypted and validated Card, then committed the encrypted envelope to IndexedDB before acknowledging.
Continued: Continue was tapped, not a promise that the destination loaded. Local receipt intent persists and retries monotonically after failures. Acknowledgments never delete relay envelopes.
Unconfirmed encrypted sends are saved locally before POST and can be retried byte-for-byte after reload. Titles, URLs and notes are never sent to the API. The inbox saves encrypted envelopes locally and decrypts to memory for display. Expired local envelopes are purged too.

## HTTPS deployment (3D)
The current default is [one Render service and Turso](0004-render-turso.md). The following persistent-volume deployment remains an alternative.
Serve the built web app and API at one stable configured origin behind Caddy. A Docker named volume holds SQLite; another holds TLS state. The app port is private to the Compose network. HTTPS is required off loopback. No plaintext development routes remain.
Clearing site data loses private keys, local trust and receipt intent. The UI must state that pairing again is required. A phone's loopback address is not the laptop.

Sources: [Web Crypto deriveKey](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey), [AES-GCM parameters](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams), [CryptoKey structured storage](https://www.w3.org/TR/webcrypto/), [secure contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts), [Node SQLite](https://nodejs.org/api/sqlite.html).
