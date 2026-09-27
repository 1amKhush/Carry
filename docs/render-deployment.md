# Render Free + Turso libSQL

Carry runs as one Node web service. Fastify serves `apps/web/dist` and `/api` at the same HTTPS origin. Turso holds the durable relay data; no Render filesystem persistence is needed.

## Database

Use a **libSQL** database for `@libsql/client`. When creating one with the Turso CLI, omit `--tursodb`. Put `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` only in the API environment. Never prefix them with `VITE_` or add them to frontend files.

The shared schema is [schema.sql](../apps/api/src/store/schema.sql). It includes the device/pairing/session tables, encrypted envelopes, receipt timestamps, expiry/inbox indexes, and primary keys on envelope/dedupe IDs. API startup applies the idempotent schema before listening. It does not drop tables or import an existing local SQLite database.

To apply it explicitly from the repository root:

```sh
# One-time setup if the ignored credentials file does not already exist:
cp apps/api/.env.example apps/api/.env.turso.local
# Edit that local file with the database URL/token, then:
pnpm --filter @carry/api db:migrate
pnpm --filter @carry/api test:turso
```

The live integration test uses fresh identities and removes only their records. It disables automatic global expiry cleanup, tests expiry filtering with its own expired fixture, and removes that fixture by ID. The normal expiry sweep is tested locally with temporary databases. Do not overwrite an existing credentials file with the example. The real credentials file is ignored by Git and Docker.

Normal `pnpm dev` still uses local SQLite. To use Turso locally, run these in separate terminals instead:

```sh
pnpm --filter @carry/api exec node --env-file=.env.turso.local --watch src/server.ts
pnpm dev:web
```

## Create the Render service

Push this repository, then choose **New → Web Service** on Render and connect the repo. Use **Node** as the language and **Free** as the instance type. Leave Root Directory blank when the Carry workspace is the repository root; if Carry is nested, set it to that directory.

| Setting | Value |
| --- | --- |
| Build command | `npx --yes pnpm@10.34.5 install --frozen-lockfile --prod=false && npx --yes pnpm@10.34.5 build` |
| Start command | `node apps/api/src/server.ts` |
| Health check path | `/api/health` |
| `NODE_VERSION` | `24.21.0` |
| `NODE_ENV` | `production` |
| `CARRY_SERVE_WEB` | `1` |
| `TURSO_DATABASE_URL` | Your libSQL database URL |
| `TURSO_AUTH_TOKEN` | Your database token, stored as a service secret |

[render.yaml](../render.yaml) supplies the same settings for a Blueprint deployment and prompts for the two database values. Manual Web Service creation requires entering the settings above. No pre-deploy command or persistent disk is required.

Render provides `PORT`, `RENDER`, and `RENDER_EXTERNAL_URL`. Carry listens on `0.0.0.0:$PORT`, uses `RENDER_EXTERNAL_URL` as its authentication/pairing origin, and refuses to start on Render without Turso credentials. For a custom domain, set `CARRY_ORIGIN` to that exact HTTPS origin without a trailing slash. Open that same origin on both devices. Changing origins creates a separate browser identity and requires pairing again.

The build explicitly installs development dependencies so TypeScript and Vite remain available with `NODE_ENV=production`. Database credentials are read only by the API at runtime. `/api/*` errors remain JSON; browser navigation routes receive `index.html`.

## Verify the deployment

1. Open the service HTTPS URL and `/api/health`; the latter must return `{"ok":true}` after a successful database query.
2. Open the same HTTPS URL on your laptop and phone. Follow [the actual-device acceptance checklist](real-device-acceptance.md).
3. With the phone closed, send a card and wait for **Queued**. Restart the service from Render, then open the phone and verify Inbox and the exact Continue URL.
4. Keep the same Turso database and environment values across restarts/redeploys. No local database copy is needed for a fresh phone test.

Render Free can spin down after 15 minutes without inbound traffic; a cold start can take about a minute. Queued cards remain in Turso. Expired cards are filtered from every read, even before cleanup; physical cleanup runs on startup and at most once per minute while the service is awake. It resumes after a cold start. This deployment does not add background phone delivery or notifications.

Sources: [Turso engines and setup](https://docs.turso.tech/quickstart), [Turso TypeScript SDK](https://docs.turso.tech/sdk/ts/reference), [Render web services](https://render.com/docs/web-services), [Render environment variables](https://render.com/docs/environment-variables), [Render Free limitations](https://render.com/docs/free).
