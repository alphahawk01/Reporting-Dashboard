# PlayHQ Live Scores Worker

A small Cloudflare Worker that proxies the PlayHQ spectator GraphQL endpoint
behind your own domain, so your reporting dashboard can fetch live scores
without talking to PlayHQ directly from the browser.

It validates the fixture id, calls PlayHQ server-side with the same query/
headers as the original cURL request, caches each fixture's response at the
edge (default 90s) so repeated polls collapse to one upstream call, sets CORS
for your dashboard, and surfaces rate-limit / forbidden responses so a poller
can back off.

## Endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/fixtures/:id/live-scores` | Full game payload (status, score, periods, clock) |
| GET | `/api/fixtures/:id/status` | `{ id, status, updatedAt }` |
| GET | `/health` | `{ ok: true }` |

`:id` is the PlayHQ game id (e.g. `ab5ae0c9`) — the id the GraphQL `game`
query expects, which may differ from a fixture id in your own database.

## Develop & deploy

```bash
cd playhq-worker
npm install

# Run locally (http://localhost:8787)
npm run dev
# then: curl http://localhost:8787/api/fixtures/ab5ae0c9/live-scores

# First-time auth, then publish
npx wrangler login
npm run deploy
```

After `deploy` (with no route configured) the Worker is live at
`https://playhq-scores.<your-subdomain>.workers.dev`, which works immediately
for testing.

## Point it at your domain

Once your domain is on Cloudflare, uncomment the `routes` block in
`wrangler.toml` and set your zone. A subdomain is simplest:

```toml
routes = [{ pattern = "scores.yourdomain.com.au/*", zone_name = "yourdomain.com.au" }]
```

Then your dashboard calls e.g.
`https://scores.yourdomain.com.au/api/fixtures/ab5ae0c9/live-scores`.

## Config (`wrangler.toml` `[vars]`)

- `ALLOWED_ORIGINS` — comma-separated browser origins allowed via CORS. Set
  this to your dashboard origin(s) in production instead of `*`.
- `PHQ_TENANT` — PlayHQ tenant, default `afl`.
- `CACHE_TTL_SECONDS` — edge cache TTL per fixture, default `90` (below a
  2-minute poll so polls stay fresh while concurrent viewers share a response).

## Polling guidance

For 3–4 fixtures at 2-minute intervals this is light load. Poll only active
matches, stop when they finish, and if the Worker returns `429` (with
`Retry-After`) or `403`, back off rather than retrying hard.

## Caveat

This uses PlayHQ's spectator endpoint, not an officially supported public API.
Confirm your use complies with PlayHQ's terms; the endpoint or its access rules
can change without notice.
