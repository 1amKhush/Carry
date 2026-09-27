# 0006 — Resumable task context

Status: implemented locally; actual laptop-to-phone acceptance remains to be recorded after deployment.

## Card compatibility and privacy

`goal` (160 characters), `nextAction` (240), and `excerpt` (1,200) are optional properties of the existing encrypted Card. Missing fields mean an older card. No relay schema or envelope version change is needed: the API still validates routing/envelope shape and stores ciphertext, while the recipient validates the decrypted Card. New sends omit empty context fields. The Resume view gives older cards a neutral next-action fallback and still shows their original links and note.

The existing form and session draft keep all context editable. A short plan is visible beside the primary URL, while the optional excerpt field is revealed when selected text arrives or the user asks to add a detail. Capturing remains a draft; only Send encrypts and queues it. A selected passage that exceeds the limit is not silently clipped into the form: Carry explains that it was too long and leaves the URL/title draft usable.

## Deliberate selected-text capture

The Chrome/Edge extension adds a **Carry selected text** context-menu item, shown when text is selected on an HTTP(S) page. It uses the browser's `selectionText` from that explicit click, with `editable` checked before import. Editable form fields are refused; no script reads page DOM, forms, passwords, or browsing history. The toolbar action still captures URL/title only. Permissions are `activeTab` and `contextMenus`, with no host permissions or content scripts. URL/title/short selected excerpt travel in a fragment to Carry and are removed on load before the app makes requests. They remain local plaintext in the unsent per-tab draft, as with notes; relay data is encrypted.

## Resume ordering

Inbox entries open a dedicated `#resume/<card-id>` screen. The received card shows next action, goal and excerpt, then the exact primary URL and Continue button, followed by related links and original note. Continue retains the original URL bytes, including query and fragment, and sends the existing Continued receipt. The Resume route reloads from the encrypted inbox, so closing and reopening the browser does not depend on React state.

## Verification

Unit tests cover optional/missing fields and limits, encrypted-card round trips, selection bounds, and editable rejection. Browser tests cover draft review, legacy-card fallback, accessible Resume, closed browser plus API restart, exact Continue and relay storage without plaintext. Chrome and Edge runtime tests verify the menu exists and the existing toolbar action still works. The live Turso integration test sends synthetic context, inspects the stored payload for its plaintext strings, decrypts after restart, and cleans only its own records. An actual phone run and a manual right-click menu check remain necessary after deploying the matching web app and reloading the extension.
