# Memory — Build History & Decision Log

> The narrative of how this project was built and *why the notable decisions were
> made*, so a new developer or agent inherits the reasoning, not just the result.
> Append new entries at the top of the Decision Log as the project evolves.

## Build timeline (commit narrative)

The history is intentionally readable as a progression. `git log --oneline`:

1. `chore: project scaffold` — Nest.js app, Redis docker-compose, env template.
2. `feat: queue-based crawler` — Part 1 + Part 2 core: REST API, BullMQ worker,
   Cheerio extraction, Puppeteer engine, UA/proxy rotation.
3. `test: unit tests` — offline suite for extraction, rotators, fetcher, service,
   controller.
4. `docs: README` — architecture, anti-bot strategy, 25k-site scale notes,
   sample outputs.
5. `chore: pin dotenv` — imported directly in `main.ts`, so made explicit.
6. `feat: Bull Board dashboard` — queue visibility at `/admin/queues`.
7. `feat: GET /crawls history endpoint` — paginated job history.
8. `feat: production readiness` — Dockerfile, Render blueprint, `/health` probe,
   default port → 3333.

## Decision log (most recent first)

### Deployed to Render via Docker, not native build
Part 2 needs Puppeteer/Chromium, whose shared libraries are unreliable on
Render's native Node environment. Chose a **multi-stage Dockerfile** installing a
**system Chromium** (`/usr/bin/chromium`) and pointing Puppeteer at it via
`PUPPETEER_EXECUTABLE_PATH` — browser and libs stay in lockstep. Runs non-root
with `dumb-init` to reap Chromium's child processes. `render.yaml` provisions the
web service + managed Redis and injects `REDIS_URL` automatically.
**Verified live:** all endpoints, including the browser engine, work on the
deployed free-tier instance. Free-tier caveats: cold start after idle (~30–60s
first request) and tight memory for the browser engine — documented, not hidden.

### Default port changed 3000 → 3333
To avoid clashing with other local services that default to 3000. The app still
reads `PORT` first, so platform-injected ports (Render sets its own) are
unaffected; 3333 is only the local default. Binds `0.0.0.0` for containers.

### `REDIS_URL` support added
Managed hosts expose Redis as a single connection string, not host/port.
`redis.config.ts` prefers `REDIS_URL` (parsing credentials and enabling TLS for
`rediss://`) and falls back to `REDIS_HOST`/`REDIS_PORT` for local Docker.

### `/health` endpoint (Terminus)
A platform probe must fail if the system can't actually do work. It returns
**200 only when Redis is reachable AND ≥1 worker is registered on the queue**,
else 503 — because a queue with no worker would silently accept jobs and never
process them. Also surfaces job counts. Wired as Render's `healthCheckPath`.

### `GET /crawls` history endpoint (beyond spec)
The spec only requires status-by-id. A paginated history endpoint was added
because it's cheap (reads the same job store) and pairs with the dashboard for
demo/ops. **Bug found & fixed during live testing:** BullMQ's `getJobs` applies
its range per state-bucket and doesn't order across buckets, so `limit=3` first
returned 4 items. Fixed by fetching the candidate window, merging, sorting by
enqueue time, then slicing — so `count` never exceeds `limit`. The fix was folded
into the feature commit (it hadn't been pushed yet).

### Bull Board over a custom UI (beyond spec)
The task never asked for a dashboard. Considered building a bespoke crawl-history
UI; rejected it as scope creep for a *backend* role and because Swagger already
covers interactive testing. Bull Board gives real queue visibility in ~15 lines,
on-domain, and signals BullMQ-ecosystem fluency. Registered at the root
(`BullBoardModule.forRoot`) with the queue attached via `forFeature`.

### Python was ruled out; TypeScript/Nest.js was mandatory
The author's scraping background is primarily Python. The spec, however, names
Nest.js, Axios, Cheerio, BullMQ and Puppeteer explicitly, so submitting Python
would read as dodging the test. Decision: build in the required stack, leaning on
real TypeScript fluency. The scraping *concepts* transfer; the syntax was the
only gap. This is stated plainly rather than hidden.

### Queue-first architecture (foundational)
See [rules.md](./rules.md) §2. The single most important decision: crawling is
slow and unreliable, so it must not run inside the HTTP request. Everything else
(central rate limiting, retries, horizontal worker scaling to 25k+ sites) follows
from this shape.

### No database (intentional)
Results are stored on the BullMQ job in Redis with 24h retention. The spec needs
no durable store, so none was added. The documented upgrade path is a Postgres
store behind a repository interface — noted in the README scale section.

## Known limitations (inherited, not bugs)
- History and results are bounded by Redis retention (24h) — not a durable audit
  log.
- No live CAPTCHA/Cloudflare/Akamai solving is wired in; the README documents how
  it *would* be handled. The target of the assessment has no such defenses.
- Single-page crawl only (no link-following/depth); the queue design makes
  depth-N crawling an additive change (enqueue discovered URLs).
- Free-tier Render: cold starts and limited memory for the browser engine.

## Verification status
- `npm test` → 8 suites / 43 tests green; `npx tsc --noEmit` clean.
- Local end-to-end verified against live Redis (both engines).
- **Live deployment** verified end-to-end at
  `https://showtimes-crawler.onrender.com` — health, Swagger, both fetch engines,
  history, all cancel/validation error paths.
