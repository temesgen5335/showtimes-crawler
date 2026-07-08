# Rules — Design Choices, Stack & Conventions

> The *opinions* of this codebase. Follow these unless you have a documented
> reason not to. Pairs with [context.md](./context.md) (why the project exists)
> and [memory.md](./memory.md) (how these choices came to be).

## 1. Technology & framework choices (and why)

| Concern | Choice | Why this, not the alternative |
|---|---|---|
| Framework | **Nest.js** | Required by the spec; gives DI, modules and testability out of the box. Structure it idiomatically (modules → controllers → services → providers). |
| HTTP fetch | **Axios** | Required by spec. Default, cheap engine. |
| HTML parsing | **Cheerio** | Required by spec. Server-side jQuery-like API; fast, no browser. |
| Headless browser | **Puppeteer** | Required by spec (Part 2). Used only when a page needs JS rendering — it is expensive, so it is opt-in per job. |
| Job queue | **BullMQ** | Required by spec. Gives retries, backoff, rate limiting, concurrency and job state for free. |
| Queue store | **Redis** | Required by spec. Also backs the rate limiter and job history. |
| API docs | **Swagger** (`@nestjs/swagger`) | Required by spec. DTOs are decorated so docs stay in sync with code. |
| Validation | **class-validator / class-transformer** | Declarative DTO validation via a global `ValidationPipe` (`whitelist: true, transform: true`). |
| Queue dashboard | **Bull Board** | Standard BullMQ dashboard; zero custom UI. Read-only queue visibility. |
| Health checks | **@nestjs/terminus** | Idiomatic Nest health module; returns 200/503 for platform probes. |
| Config | **@nestjs/config** + `dotenv` | All tunables via env; nothing hard-coded. |

**Rule:** the required libraries above are load-bearing — do not swap them
(a reviewer expects them). Additional libraries are allowed when justified.

## 2. Architectural rules

- **Queue-first, never fetch-in-the-request.** `POST /crawl` enqueues and returns
  a job id immediately. All slow/fragile work happens in the BullMQ worker
  (`crawl.processor.ts`). Throughput is governed centrally (rate limit,
  concurrency, retries), not per-request.
- **Fetching is a strategy, behind an interface.** `PageFetcher`
  (`fetcher/page-fetcher.interface.ts`) has two implementations — `AxiosFetcher`
  (`http`) and `PuppeteerFetcher` (`browser`). The processor picks per job. The
  queue, API and extractor never learn which engine ran. **Adding an engine
  (e.g. Playwright, a CAPTCHA-solving proxy) is a new class, not a rewrite.**
- **Extraction is pure and I/O-free.** `ExtractionService.extract(html, baseUrl)`
  takes already-fetched markup and returns data. No network inside it — that is
  what keeps it exhaustively testable against fixtures. All URLs are resolved to
  absolute against the post-redirect URL, de-duplicated, and non-fetchable
  schemes (`data:`, `javascript:`) are dropped.
- **Anti-blocking is composable and config-driven.** UA rotation
  (`user-agent.rotator.ts`) and proxy rotation (`proxy.rotator.ts`) are small
  round-robin services fed from env. Empty proxy list ⇒ fetch direct. Rate
  limiting is the BullMQ worker limiter, not ad-hoc sleeps.
- **Cancellation is honest.** Queued job → removed. Active job → a
  `cancelRequested` flag is set and the worker aborts at its next checkpoint
  (before/after fetch); it does **not** pretend to force-kill a running fetch.
  Finished job → 409. Keep this semantics if you touch cancellation.
- **Results live on the job** (Redis, 24h retention). There is intentionally
  **no database**. If you need durable history/analytics, add a Postgres store
  behind a repository interface — do not smear persistence across services.
- **Config over constants.** Ports, timeouts, attempts, rate limits,
  concurrency, proxy list, board route, Chromium path — all env. See
  `.env.example` (the annotated source of truth) and `redis.config.ts` for the
  `REDIS_URL`-vs-host/port precedence.

## 3. Code conventions

- **One responsibility per file/dir.** `crawl/` is split into `dto/`,
  `extraction/`, `fetcher/`, `anti-blocking/`. Keep new concerns in their own
  folder rather than growing a service.
- **DTOs are the API contract.** Every request/response shape is a decorated DTO
  in `crawl/dto/`. Swagger and validation both derive from them — update the DTO,
  not an ad-hoc object.
- **Comment the *why*, not the *what*.** Existing comments explain non-obvious
  decisions (favicon fallback chain, per-state pagination merge, container
  Chromium flags). Match that density; don't narrate obvious code.
- **TypeScript stays honest.** Prefer real types; the few casts that exist
  (e.g. narrowing BullMQ's `client` to `{ ping }`) are localized and commented.
  Don't sprinkle `any`.
- **Match the surrounding style.** Prettier + ESLint are configured; run
  `npm run format` / `npm run lint`.

## 4. Testing rules

- **Tests are offline and deterministic.** No real network, no real Redis, no
  real browser in unit tests — mock the queue, axios and fetchers. Extraction is
  tested against fixture HTML. (`jest`, `*.spec.ts` next to the unit.)
- **Every new unit gets a spec.** Current suite: 8 spec files / 43 tests. A PR
  that adds behavior without a test is incomplete.
- **Test the edges, not the happy path only.** The value is in favicon
  fallbacks, URL-resolution edge cases, the cancellation state machine, proxy
  credential masking, `REDIS_URL` parsing and pagination bounds.
- **`npm test` must be green before commit.** Also run `npx tsc --noEmit` to
  catch type regressions the way CI would.

## 5. Git & delivery rules

- **Clean, logical commit history.** One coherent change per commit; imperative
  subject; body explains the why. History reads as a build narrative (scaffold →
  crawler → tests → docs → dashboard → history → production-readiness).
- **No AI co-author trailers** in commits (project preference).
- **Never commit secrets.** `.env` is git-ignored; only `.env.example` is
  tracked. Proxy credentials are masked in API output — keep them masked.
- **Don't push without being asked**, and confirm the working tree is clean and
  `npm test` passes first.

## 6. Non-negotiables

1. Preserve the **honesty principle** ([context.md](./context.md)): don't add
   features you can't defend; document what's stubbed or bounded.
2. Keep the **three spec endpoints** and their contracts intact
   (`POST /crawl`, `GET /status/:id`, `DELETE /cancel/:id`).
3. Keep the **required stack** (§1) in place.
4. Keep **fetching pluggable** and **extraction pure**.
