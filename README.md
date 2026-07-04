# Showtimes Crawler

A queue-based web crawler built as a Nest.js application. You POST a URL, it
enqueues a crawl job, a worker fetches the page and extracts structured data,
and you poll for the result. It ships with two interchangeable fetch engines
(plain HTTP and a headless browser), user-agent and proxy rotation, worker-level
rate limiting, Swagger docs and a unit-test suite.

This was built as the technical assessment for the Senior Crawler Developer role
at International Showtimes, following the two-part task spec (Part 1: the
crawler; Part 2: proxy/VPN support).

---

## Quick start

Requirements: Node.js 20+, Docker (for Redis).

```bash
# 1. install dependencies
npm install

# 2. start Redis (BullMQ's backing store)
docker compose up -d

# 3. configure environment
cp .env.example .env

# 4. run the app
npm run start:dev
```

The API is now on `http://localhost:3000` and the interactive Swagger UI on
**`http://localhost:3000/docs`**.

```bash
# run the test suite (no network or Redis required — everything is mocked)
npm test
```

The headless-browser engine downloads a Chromium build on first `npm install`
(Puppeteer does this automatically). No other setup is needed.

---

## Using the API

Three endpoints, exactly as specified. Full schemas are in Swagger.

**Enqueue a crawl** — returns immediately with a job id.

```bash
curl -X POST http://localhost:3000/crawl \
  -H 'Content-Type: application/json' \
  -d '{ "url": "https://www.wikipedia.org" }'
# { "id": "1", "url": "https://www.wikipedia.org", "state": "waiting" }
```

Optionally pick the engine per job: `{ "url": "...", "engine": "browser" }`
(`http` is the default; `browser` uses Puppeteer for JS-rendered pages).

**Poll status / get the result:**

```bash
curl http://localhost:3000/status/1
```

```jsonc
{
  "id": "1",
  "state": "completed",          // waiting | active | completed | failed
  "progress": 100,
  "result": {
    "title": "Wikipedia",
    "metaDescription": "Wikipedia is a free online encyclopedia ...",
    "favicon": "https://www.wikipedia.org/static/favicon/wikipedia.ico",
    "scripts":     ["https://.../index.js", "..."],
    "stylesheets": ["..."],
    "images":      ["https://.../Wikipedia-logo-v2.png"],
    "finalUrl": "https://www.wikipedia.org/",
    "statusCode": 200,
    "fetchedWith": "http",
    "userAgent": "Mozilla/5.0 ...",   // which rotated UA was used
    "proxy": null                     // which proxy (credentials stripped)
  }
}
```

**Cancel a job:**

```bash
curl -X DELETE http://localhost:3000/cancel/1
```

Real sample responses for both engines are in [`samples/`](./samples).

---

## Architecture

```
POST /crawl ──▶ CrawlController ──▶ CrawlService.enqueue() ──▶ BullMQ queue (Redis)
                                                                     │
                                                                     ▼
GET /status/:id ◀── CrawlService.getStatus() ◀────────────  CrawlProcessor (worker)
                                                              │  1. pick engine
DELETE /cancel/:id ─▶ CrawlService.cancel()                   │  2. rotate UA + proxy
                                                              │  3. fetch page
                                                              │  4. extract data
                                                              ▼
                                                     PageFetcher (strategy)
                                                     ├── AxiosFetcher      (http)
                                                     └── PuppeteerFetcher  (browser)
                                                              │
                                                              ▼
                                                     ExtractionService (Cheerio)
```

The code is organised by responsibility inside `src/crawl/`:

| Area | Files | Responsibility |
|------|-------|----------------|
| API | `crawl.controller.ts`, `dto/` | HTTP surface + request/response validation and Swagger schemas |
| Orchestration | `crawl.service.ts` | Enqueue, status lookup, cancellation logic |
| Worker | `crawl.processor.ts` | The BullMQ consumer: engine selection, rotation, rate limiting |
| Fetching | `fetcher/` | `PageFetcher` interface + Axios and Puppeteer implementations |
| Parsing | `extraction/` | Pure HTML → data extraction with Cheerio |
| Anti-blocking | `anti-blocking/` | User-agent and proxy rotators |

### Key design decisions (and why)

**Queue-first, not fetch-in-the-request.** `POST /crawl` returns a job id
immediately and the work happens in a BullMQ worker. This is the design the spec
asks for, and it's the right one: crawling is slow and failure-prone, so it must
not block the HTTP request. It also means throughput is governed centrally (rate
limiting, concurrency, retries) rather than per-request — which is exactly what
matters when you scale from one site to many.

**A `PageFetcher` strategy interface.** Part 1 needs Axios; Part 2 needs
Puppeteer. Rather than bolting the browser on, both implement one interface and
the processor picks per job. Extraction, queueing and the API never learn which
engine ran. Adding a third engine later (Playwright, or a CAPTCHA-solver proxy)
is a new class, not a rewrite.

**Extraction is pure and I/O-free.** `ExtractionService.extract(html, baseUrl)`
takes markup a fetcher already retrieved. That keeps the parsing logic — the
part with all the fiddly edge cases — testable against fixtures with no network,
and reusable regardless of how the HTML was obtained. All extracted URLs are
resolved to absolute form against the post-redirect URL, de-duplicated, and
non-fetchable references (`data:`, `javascript:`) are dropped.

**Favicon has a fallback chain.** `<link rel="icon">` → `rel="shortcut icon"` →
`rel="apple-touch-icon"` → the conventional `/favicon.ico`. Real sites are
inconsistent here, so mirroring what a browser actually does is the honest
behaviour.

**Results are stored on the job.** The crawl result is the job's return value,
held in Redis (finished jobs are retained for 24h). No separate database is
introduced because the spec doesn't need one — see the scale notes for where a
persistent store would go.

**Cancellation is honest about what's possible.** A *queued* job is removed
outright. An *active* job can't be safely killed mid-fetch, so `cancel` sets a
`cancelRequested` flag and the worker checks it at checkpoints (before and after
the fetch) and aborts with an unrecoverable error. A *finished* job returns
409. This is the real BullMQ cancellation story rather than pretending a running
job can be force-killed.

---

## Anti-blocking strategy (Part 2)

The spec asks for proxy/VPN support, UA rotation and rate limiting. Here's what
is implemented, and — since the task takes an arbitrary URL rather than a
specific hardened target — how the same structure extends to the sophisticated
defenses (Cloudflare, Akamai, CAPTCHA) called out in the job description.

**Implemented and working:**

- **User-agent rotation** — round-robin over a pool of realistic, current
  desktop browser UAs (`anti-blocking/user-agent.rotator.ts`). Overridable via
  the `USER_AGENTS` env var. A missing or bot-like UA is the single most common
  block trigger; this clears it.
- **Proxy / IP rotation** — round-robin over `PROXY_URLS` (comma-separated,
  `http://user:pass@host:port` supported). Wired into both engines: Axios via
  `https-proxy-agent`, Puppeteer via `--proxy-server` + `page.authenticate()`.
  Provider-agnostic: a datacenter list, a residential pool (Bright Data,
  Oxylabs), or a VPN exposed as an HTTP proxy all work unchanged. Credentials
  are stripped before anything is logged or returned. With no proxies set it
  fetches directly, so the crawler runs out of the box.
- **Rate limiting** — enforced at the BullMQ worker (`RATE_LIMIT_MAX` jobs per
  `RATE_LIMIT_DURATION_MS`, plus `WORKER_CONCURRENCY`). Limiting at the worker,
  not per-request, means the ceiling holds no matter how many jobs the API
  accepts — protecting both the target site and a metered proxy pool.
- **Headless browser** — Puppeteer with per-job UA and proxy, waiting for
  network-idle so lazily-injected DOM is captured. This is the foundation for
  defeating fingerprinting.
- **Retries with backoff** — `JOB_ATTEMPTS` with exponential backoff, free from
  BullMQ, so transient blocks/timeouts get a second chance.

**How I'd extend it for hardened targets (not needed for this task's open URL,
but this is the design):**

- **Cloudflare / Akamai** — these fingerprint the TLS/JA3 signature and browser
  environment, so a plain HTTP client won't pass. The route is the browser
  engine plus stealth patches (`puppeteer-extra-plugin-stealth`) to hide the
  `navigator.webdriver` tells, paired with **residential** proxies — datacenter
  IPs are pre-flagged. For the hardest interstitials, a solver service
  (FlareSolverr) slots in as another `PageFetcher` implementation behind the
  same interface. Because the fetcher is pluggable, none of this touches the
  queue or extraction code.
- **CAPTCHA** — integrate a solver (2Captcha / Anti-Captcha) at the fetch layer:
  detect the challenge, submit the token, retry. I've used these before in
  Python; the integration point here is a decorator around the browser fetcher.
- **Behavioural detection** — randomised inter-request delays (jitter on the
  rate limiter), realistic header sets and viewport sizes, and per-domain
  session/cookie reuse so a crawl looks like a returning visitor.

I've kept the code to what the task needs and documented the rest, rather than
shipping anti-bot machinery I couldn't exercise against a real target here.

---

## Testing

```bash
npm test
```

32 unit tests, fully offline (network and Redis mocked):

- **Extraction** — title/meta/favicon/URL extraction against fixture HTML,
  including the favicon fallback chain, relative-URL resolution, de-duplication
  and rejection of `data:` URIs.
- **Rotators** — round-robin wrap-around and env overrides for both UA and
  proxy; credential masking.
- **Fetcher** — Axios called with the rotated UA, browser headers, proxy agent
  wiring, redirect handling and error propagation (mocked axios).
- **Service** — the cancellation state machine (queued vs active vs finished)
  and 404 handling, with a mocked BullMQ queue.
- **Controller** — endpoints delegate correctly to the service.

The processor's live fetch and the Puppeteer launch are covered by end-to-end
manual runs (see `samples/`) rather than unit tests, since mocking a real
browser launch adds little confidence over running it.

---

## Configuration

All via `.env` (see `.env.example` for the annotated list):

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3000` | HTTP port |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | Queue store |
| `FETCH_ENGINE` | `http` | Default engine (`http` or `browser`) |
| `FETCH_TIMEOUT_MS` | `15000` | Per-request timeout |
| `JOB_ATTEMPTS` | `2` | Attempts before a job is failed |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_DURATION_MS` | `5` / `1000` | Worker throttle |
| `WORKER_CONCURRENCY` | `3` | Concurrent jobs per worker |
| `PROXY_URLS` | *(empty)* | Comma-separated proxy list; empty = direct |
| `USER_AGENTS` | *(built-in pool)* | Optional UA override |

---

## Scaling this to 25,000+ sites

The task is a single-URL crawler; International Showtimes tracks 25k+
entertainment sites. The queue-first design is deliberately the shape that
scales — here's the honest path from this to that:

1. **Workers scale horizontally, already.** BullMQ + Redis means you run N
   worker processes against one queue with zero code change; the rate limiter is
   global to the queue, so the politeness ceiling holds across the fleet.
2. **Per-domain politeness.** At 25k sites you don't want one global rate limit,
   you want per-host limits (and per-host proxy affinity). BullMQ's job groups /
   a keyed limiter, or one queue per domain-shard, gives that.
3. **Scheduling.** Entertainment data (showtimes) is time-sensitive and
   re-crawled on a cadence. A repeatable-job scheduler (BullMQ supports cron
   repeatable jobs) drives recurring crawls; sites get tiered by volatility.
4. **Persistence.** Results move off the job payload into Postgres (structured
   showtime records) with Redis staying as the queue + a dedup/seen-URL cache.
   This is the one component I'd add first for production.
5. **Adaptive fetching.** Start every domain on the cheap HTTP engine; when a
   site starts returning blocks or JS-only shells, auto-escalate that domain to
   the browser engine + residential proxies. Most of 25k sites don't need a
   browser; you pay for it only where required.
6. **Observability.** Per-domain success rates, block rates and latency — so you
   see a site's defenses change before the data silently goes stale. Bull Board
   gives queue visibility for free.
7. **Extraction config per site.** A generic extractor gets you the metadata
   here; showtime extraction needs per-site selectors/rules. That becomes a
   config-driven layer (selectors in data, not code) so onboarding a site is a
   config change, not a deploy.

---

## What I'd add with more time

- **Depth crawling** — the task's data points are all single-page, so this
  extracts one page per job. Following links to depth *N* is a natural extension:
  the extractor already collects URLs, so the worker would enqueue child jobs
  with a depth counter and a visited-set in Redis. I left it out to keep the
  submission focused on what was asked.
- **A persistent results store** (Postgres) as described above.
- **`puppeteer-extra-plugin-stealth`** and a warm browser pool (the current
  implementation launches a browser per browser-engine job — correct and
  leak-free, but a pool would amortise the ~1s launch cost at scale).
- **Integration tests** with a fixture HTTP server, and CI (lint + test on PR).

---

## A note on the stack

The spec named the stack explicitly — Nest.js, Axios, Cheerio, BullMQ,
Puppeteer, Swagger — so this is built exactly on it. My deepest scraping
experience is in Python (Scrapy, BeautifulSoup, Selenium, and hands-on with
CAPTCHA/Cloudflare tooling), and my TypeScript is strong from general backend
work. The concepts here — queueing, politeness, rotation, headless browsing,
anti-bot evasion — are the same ones I've applied in Python; this submission is
those concepts expressed idiomatically in the Node.js stack the team uses. Where
I've noted anti-bot techniques as "how I'd extend it" rather than shipping them,
that's because the task target is an open URL with no real defenses to exercise
them against, and I'd rather document capability honestly than ship machinery I
couldn't demonstrate working.
