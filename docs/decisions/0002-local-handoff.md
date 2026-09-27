# 0002 — Local development handoff

Status: accepted for milestone 2. Supersedes the in-memory browser-only storage and session-scoped IDs in 0001.

Use one shared JSON Schema contract with Ajv runtime validation. The browser and Fastify API use the same schemas, custom HTTP(S) URL validation, field limits, and canonical UTC timestamp rule. Fastify rejects rather than coerces malformed fields. No delivery metadata is inserted into card content.

Use UUID v4 card IDs and browser device IDs. Keep the latter in origin-scoped localStorage. A copied ID is a development routing label, not an identity credential or pairing confirmation.

POST /api/dev/handoffs accepts a recipient and card, stores a copy in that recipient's in-memory queue, and returns 201 with the card ID. GET /api/dev/inbox/:deviceId returns newest-received-first cards without consuming them. Empty unknown inboxes return an empty array. Reloading or closing a browser does not delete the queue; restarting the API does.

The web form keeps its draft on an error and clears it only after acceptance. It remains on New card after sending because the receiving inbox belongs to another profile. Inbox fetches on entry, polls every three seconds, provides manual refresh, and cancels outstanding work when unmounted. Failed reads retain any displayed cards with an error explaining that they may be stale.

Bind both Vite and the API to 127.0.0.1 and proxy /api locally. Do not add remote hosts, pairing UI, encryption placeholders, or extension scaffolding. Authentication, persistence, encryption, idempotency, expiration, acknowledgments, and HTTPS are deferred to the next milestone. No request or card-content logs are enabled.

Acceptance evidence: two distinct persistent browser profiles; B closes before A sends; A closes after the API confirms; B reopens with its previous ID and fetches the card. Continue preserves the saved destination including query and fragment. Additional checks cover polling, isolation, validation on both boundaries, error recovery, and API restart clearing.
