# 0005 — Page capture into the existing editor

Status: web capture, Chrome/Edge extension, and opt-in Android share-target implementation. Actual Android system-share acceptance is still required before enabling that enhancement in normal production builds.

## One editor and explicit sending

Both inputs converge on `capture/importDraft.ts` and `capture/normalize.ts`, then populate the existing `NewCard`. HTTP(S) validation comes from `packages/protocol`. `parseExactHttpUrl` validates without reconstructing the URL, so query order, percent-escape casing and fragments remain intact. Browser URL handling still applies when opening a destination. Notes, related links and the paired recipient stay editable. A long page title is shortened to the card contract's 120-character limit with an explanation.

Capture never creates a Card ID or calls the envelope endpoint. The existing Send action validates the final card, saves its retry identity/encrypted outbox attempt and sends it. There is no automatic send or automatic retry. Failed sends retain the form and attempt ID across reloads. New captures never silently replace existing work: the user can keep the draft or replace its URL/title while retaining the note, related links and recipient.

The form is saved per tab in sessionStorage; it survives reload and navigation within Carry. Closing the tab or clearing site data can remove it. This unsent draft is local plaintext, not relay data. Submitted envelopes and received cards retain the existing encrypted local-storage behavior.

## Desktop input

WXT produces Chrome and Edge MV3 builds. The sole extension permission is `activeTab`; there is no page scraping, broad tab permission, host permission, content script, clipboard access or relay access. The action uses the tab supplied by the browser after a click and opens `/#capture=` with a URI-encoded JSON object containing only URL/title. Carry removes the fragment using `history.replaceState` before registration/polling starts, validates it again and imports a draft. Missing/restricted/invalid pages result in a clear editor error. Captured content does not go in a query string, Referer or server body.

The default Carry origin is the current Render hostname. A public `WXT_CARRY_ORIGIN` build setting supports a different HTTPS deployment or loopback development; it is not a place for secrets.

## Mobile input and release gate

The ordinary installable manifest has no share target. `pnpm --filter @carry/web build --mode share-preview` or `VITE_ENABLE_SHARE_TARGET=1` selects the share manifest and registers `share-worker.js`. This keeps Android sharing opt-in until the required real-phone test is recorded. The feature is not advertised in default builds; manual paste stays available.

The share manifest declares a `POST /share-target` with multipart title/text/url fields. The worker intercepts only same-origin POSTs on that path, bounds the body to 32 KiB, rejects files, and saves the small raw input in the browser's `carry-capture-v1` IndexedDB. It redirects with 303 to `/#share=<random-id>`, exposing only an opaque identifier in the fragment. It never forwards the share body or caches API responses. A stopped worker can wake for a navigation share when the app window is closed.

The app reads that pending input, prefers an explicit URL, or extracts one unambiguous HTTP(S) link from text, and applies the same validation/import path. Pending shares expire after one day and are capped at 20; expired pending records are pruned on the next share. Imported or explicitly declined inputs are removed after the form is retained locally. Storage/input failures return to a usable editor with an explanation.

If interception is unavailable, the server redirects to an error state before parsing or echoing the POST body. This prevents plaintext application storage but cannot undo network exposure to the hosting infrastructure. The fallback is not a substitute for actual Android interception verification. Use a harmless public test link for that acceptance run, and do not enable the normal production share target until it passes.

## Verification

Unit and browser tests cover exact input, invalid schemes, text normalization, conflicts with existing drafts, failure retention, explicit sending and exact Continue. The share tests observe the HTTP server boundary and prove that intercepted POSTs do not reach it, including after worker shutdown and from an external navigation. A deliberate non-intercepted fixture proves the observer works and the fallback does not parse the body. The existing pairing/encryption/receipts/Unpair tests remain in the suite.

Chrome and Edge are tested separately using their real extension runtime and toolbar-action testing API. Mobile emulation and a synthetic share POST do not prove Android's native share-sheet integration. See [the real Android checklist](../capture-acceptance.md).

Sources: [MDN share targets](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target), [Chrome activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [WXT](https://wxt.dev/guide/installation).
