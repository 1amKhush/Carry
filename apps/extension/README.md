# Carry this page — Chrome and Edge

The toolbar action reads only the clicked tab's URL and title through `activeTab`, then opens Carry's existing New card editor. It has no host permissions, content scripts, device keys, database credentials, or relay client. The payload travels in a URL fragment and is removed by Carry on load. Only pressing **Send** creates an encrypted handoff.

## Build and load

From the repository root:

```sh
pnpm install
pnpm --filter @carry/extension build
pnpm --filter @carry/extension build:edge
```

- **Chrome:** open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `apps/extension/.output/chrome-mv3`.
- **Edge:** open `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select `apps/extension/.output/edge-mv3`.

Pin **Carry this page** from the browser's extensions menu. Open an HTTP(S) page and click the Carry icon. Review the draft, select a paired device, and press Send. Restricted pages such as browser settings open Carry with an explanation and an editable empty form.

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

`pnpm test:extension` uses installed Chrome and Edge, temporary browser profiles, isolated extension builds and temporary relay databases. You can set `CHROME_PATH` and `EDGE_PATH` to explicit executables. Build the web app first. The test uses current Chromium's official `Extensions.loadUnpacked` / `Extensions.triggerAction` debugging APIs, waits for the background action listener, invokes the real toolbar action, and checks the exact draft, fragment removal, absence of plaintext in app HTTP requests, no automatic send, and restricted-page rejection. Its debugging flag applies only to disposable test profiles; users do not need it.

Sources: [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [WXT entrypoints](https://wxt.dev/guide/essentials/entrypoints.html), [extension test protocol](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/).
