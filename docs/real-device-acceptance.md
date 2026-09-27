# Milestone 3D acceptance record

Status: not yet run on an actual phone. Browser viewport emulation does not satisfy this checkpoint. [Local browser and HTTPS/container verification has passed](verification-0003.md).

## Render + Turso deployment

Follow [the Render deployment guide](render-deployment.md), then use the service's HTTPS URL on both devices. The schema and scoped delivery flow have been verified against Turso; the public Render/phone run below remains pending. Restart the service from Render in step 4. Retain the same Turso database URL/token across redeploys.

## Alternative: persistent-disk Docker deployment

Use a Linux server with Docker Compose, persistent disk, and a stable DNS hostname. Point its A/AAAA records to that server; allow inbound TCP 80/443 (UDP 443 is optional). Set CARRY_DOMAIN in .env and run:

```sh
docker compose up -d --build
docker compose ps
```

Only Caddy publishes ports. The API serves the built app and authenticated routes behind Caddy at the same HTTPS origin. The relay_data named volume contains /data/carry.sqlite and its SQLite WAL files. Container rebuilds/restarts retain that volume. Do not use `docker compose down --volumes` unless intentionally deleting all data. Back up SQLite with the SQLite backup API, or stop the relay and snapshot the complete volume; copying just a live main database file can omit WAL commits.

Caddy obtains/renews certificates for the configured public hostname. Its TLS state uses separate persistent volumes. Keep the deployment origin stable: browser identity and local trust belong to that origin.

References: [Caddy HTTPS prerequisites](https://caddyserver.com/docs/automatic-https), [Docker named volumes](https://docs.docker.com/engine/storage/volumes/).

## Actual-device run

Record the hostname, date, laptop browser/version, phone model/OS/browser, and networks. Use a real phone, preferably on mobile data while the laptop uses Wi-Fi.

1. Open the HTTPS address on the laptop. Choose Pair device → Create invitation.
2. Scan its QR with the phone camera. Verify all four code groups match; approve on both devices. Both trusted-device lists must show the new peer.
3. Close the phone browser completely. On the laptop send a card with a distinctive title/note and a URL containing a path, query, percent escape, and fragment. Wait for Queued.
4. Restart the service from Render (or use `docker compose restart relay` for Docker); wait for healthy. The laptop can also be closed.
5. Reopen the same phone browser/profile at the same origin. Inbox must show exactly one card. Reload once; it must remain. Sender Delivery should show Received.
6. Press Continue. Confirm the destination retains the exact path/query/fragment. Sender Delivery should show Continued. Reload Inbox; the card must still remain until expiry.
7. From a fresh third profile, confirm no inbox access by another device ID; direct unauthenticated GET /api/v1/inbox returns 401. A third authenticated device has an empty own inbox and cannot acknowledge another device’s envelope.
8. Unpair. Sending/receipts for that pair must be rejected; both devices must require pairing again.
9. Confirm no plaintext sentinel title/URL/note exists in stored envelope payloads. The API/crypto regression suite verifies a closed SQLite database, retry deduplication, receipt retention and physical expiry cleanup. The opt-in Turso test additionally verifies cloud payload privacy, restart, concurrent retries and expiry filtering using only its own fixtures.
10. Clear only a disposable profile’s site data. It must generate a new identity and require pairing again.

## Evidence

- Public hostname: pending
- Laptop/browser: pending
- Actual phone/browser/network: pending
- QR scan + matching approvals: pending
- Recipient closed + relay restarted + exact Continue: pending
- Result: pending
