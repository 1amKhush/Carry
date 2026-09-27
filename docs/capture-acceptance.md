# Capture installation and actual Android acceptance

The Chrome/Edge extension and manual entry are enabled in normal builds. Android system sharing is opt-in until this real-device check passes. Browser simulation alone does not complete milestone 4.

## Laptop

Follow [the extension instructions](../apps/extension/README.md). Deploy the matching web app, load the correct unpacked build in Chrome or Edge, pin Carry, and click its icon on a page. Check the title and exact URL, including query/fragment; no card should appear remotely until you press Send. Confirm an internal settings page opens a usable error state.

## Android preview build

Use a test HTTPS deployment when possible. Build with either:

```sh
pnpm --filter @carry/web build --mode share-preview
# Or set VITE_ENABLE_SHARE_TARGET=1 in the build environment before pnpm build.
```

On Render, the flag is a build-time environment value: setting it requires a rebuild. No Turso token belongs in a Vite variable. The opt-in build links `/share-manifest.webmanifest`; a normal build links `/manifest.webmanifest` without a share target. Both retain the same manual editor.

1. Open the test HTTPS origin in Android Chrome. Confirm the page is controlled by `share-worker.js` using USB remote debugging, then install Carry through the browser menu. Use the same browser/profile when pairing the installed app.
2. Pair it with a laptop and confirm manual sending still works.
3. Open a harmless public URL containing query parameters, percent escapes and a fragment. Use the browser's **Share** menu and choose **Carry**.
4. Confirm the installed app opens New card with that exact URL and page title (where the source provides it). Inspect the actual share navigation in remote DevTools: the POST/303 must be handled by the service worker. The worker code must not forward the body to the network. If the server fallback error appears, stop this acceptance run; do not enable the feature for production.
5. Without pressing Send, check that the receiver has no new card. Edit the note and recipient. Navigate away/back and reload; the draft must remain. A second capture must offer to keep the existing draft.
6. Press Send, wait for Queued, then Continue on the paired laptop. Verify the exact query/fragment and delivery receipts.
7. Repeat with Carry's window closed before sharing, and after stopping/restarting the worker/browser. Repeat using a source that places the link in the shared text field.
8. Share plain text or an invalid/non-HTTP link. Carry must explain the problem and leave manual entry usable. Test with networking interrupted during Send; the draft must remain and retry must not duplicate the card.
9. Verify a browser without the installed share target still supports manual paste. Cancel the Android share chooser once; no handoff should be created.

After a passing run, enable `VITE_ENABLE_SHARE_TARGET=1` in the normal production build and redeploy. Share-target support varies by browser and requires installation; this does not add native iOS/Android share extensions, background sending or notifications.

## Record

- Test HTTPS origin: pending
- Phone model / Android version: pending
- Browser / version and installation method: pending
- Actual system-share POST intercepted locally: pending
- Title/text/URL inputs and exact Continue: pending
- Closed app / restart / failed send / cancel: pending
- Result and date: pending

Reference: [MDN share_target compatibility and POST handling](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target).
