# 0001 — Establish the local card flow first

Status: accepted for milestone 1.

Build only New card and Inbox, using local React state. Success is creating a card, seeing its context in the inbox, and opening its exact primary link with Continue.

The Card type contains a session-scoped ID, creation timestamp, primary URL, related URLs, optional title, and optional note (empty strings represent absence). It has no recipient, ciphertext, or expiry fields. Versioned validation and the encrypted delivery envelope belong in packages/protocol when delivery starts.

Only explicit HTTP(S) links are accepted. A primary link is required for this milestone; text-only cards are deferred. Up to three nonblank related links are allowed. Continue uses a normal anchor with a new browsing context and noopener/noreferrer so opening a task preserves the in-memory inbox.

There is no storage or network delivery. Reloading clears cards. This limitation is visible in the interface. Drafts survive screen changes within the session. Inbox links do not imply the destination loaded, and no delivery or receipt statuses are claimed.

Use a pnpm workspace with Node 24 and a Vite React/TypeScript client. Keep state in the parent and editor, use hash navigation for two screens, and defer protocol, API, crypto, and extension packages until their milestones. The fonts are served from the app itself so entering a private card does not require third-party resource requests.
