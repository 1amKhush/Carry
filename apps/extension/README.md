# Carry this page — Chrome and Edge

The toolbar action reads only the clicked tab's URL and title through `activeTab`. A separate **Carry selected text** right-click action imports only the explicitly selected passage through `contextMenus`, builds a text-fragment link from that selection, and refuses selections in editable form fields. Both open Carry's existing New card editor. The extension has no host permissions, content scripts, device keys, database credentials, or relay client. The payload travels in a URL fragment and is removed by Carry on load. Only pressing **Send** creates an encrypted handoff.

## Build and load

From the repository root:

```sh
pnpm install
pnpm --filter @carry/extension build
pnpm --filter @carry/extension build:edge
```

- **Chrome:** open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `apps/extension/.output/chrome-mv3`.
- **Edge:** open `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select `apps/extension/.output/edge-mv3`.

Pin **Carry this page** from the browser's extensions menu. Open an HTTP(S) page and click the Carry icon for URL/title capture. To include a short passage, highlight text on the page, right-click and choose **Carry selected text**. Review the prefilled excerpt and page link, add a goal and next action if useful, select a paired device, then press Send. On a supporting page, Continue scrolls to and highlights the passage. If the same text occurs more than once, the browser may pick an earlier match; changed text, browser support, and page opt-outs also affect highlighting. A page URL too long for a text fragment keeps the original link and shows an explanation in the draft. Restricted pages and editable form selections open Carry with an explanation and a usable form. Close any already-loaded Carry tabs and reload the unpacked extension after updating its build.

The release defaults to `https://carry-hhc6.onrender.com`. Deploy the matching web-app update before using the new extension. For another deployment or local development, use a public app origin without a trailing slash:

```sh
WXT_CARRY_ORIGIN=http://127.0.0.1:5173 pnpm --filter @carry/extension build
```

This is a build-time setting. Never put a Turso token or other secret in a `WXT_` variable. Rebuild without the override before packaging a release.

## Package

```sh
pnpm --filter @carry/extension zip
pnpm --filter @carry/extension exec wxt zip -b edge
```

The archives are under `.output/`. Unzip before choosing Load unpacked. Browser-store publication/signing is a separate step; the extension is not published to either store.

## Verify

`pnpm test:extension` uses installed Chrome and Edge, temporary browser profiles, isolated extension builds and temporary relay databases. You can set `CHROME_PATH` and `EDGE_PATH` to explicit executables. Build the web app first. The test uses current Chromium's official `Extensions.loadUnpacked` / `Extensions.triggerAction` debugging APIs, waits for the background action listener, invokes the real toolbar action, and checks menu registration, the exact toolbar draft, fragment removal, absence of plaintext in app HTTP requests, no automatic send, and restricted-page rejection. The native right-click gesture still needs a manual check in each browser after installation. Its debugging flag applies only to disposable test profiles; users do not need it.

Sources: [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [contextMenus](https://developer.chrome.com/docs/extensions/reference/api/contextMenus), [WXT entrypoints](https://wxt.dev/guide/essentials/entrypoints.html), [extension test protocol](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/).
