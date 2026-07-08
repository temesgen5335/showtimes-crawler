# Agent & Developer Onboarding

> You (human or AI agent) just joined this project. This file gets you productive
> in minutes. Read [context.md](./context.md) → [rules.md](./rules.md) →
> [memory.md](./memory.md) once, then use this as your working reference.

## 30-second mental model

A URL goes in via `POST /crawl` → lands on a **BullMQ queue** (Redis) → a
**worker** picks it, rotates identity, fetches (HTTP or headless browser),
**extracts** page data with Cheerio → the result is stored on the job → you read
it via `GET /status/:id`. Everything else (history, dashboard, health) observes
that pipeline.

```
POST /crawl → CrawlController → CrawlService.enqueue() → BullMQ queue (Redis)
                                                              │
GET /status/:id ← CrawlService ←──────────────────  CrawlProcessor (worker)
DELETE /cancel/:id → CrawlService.cancel()            │ pick engine → rotate UA+proxy
                                                      │ → fetch → extract
                                          PageFetcher (Axios | Puppeteer) + ExtractionService (Cheerio)
```

## Where things live

| You want to… | Go to |
|---|---|
| Change the API surface / validation / Swagger | `src/crawl/crawl.controller.ts`, `src/crawl/dto/` |
| Change enqueue / status / cancel / history logic | `src/crawl/crawl.service.ts` |
| Change what the worker does | `src/crawl/crawl.processor.ts` |
| Add/modify a fetch engine | `src/crawl/fetcher/` (implement `PageFetcher`) |
| Change what data is extracted | `src/crawl/extraction/extraction.service.ts` |
| Change UA / proxy rotation | `src/crawl/anti-blocking/` |
| Change queue/Redis wiring | `src/app.module.ts`, `src/crawl/crawl.module.ts`, `src/redis.config.ts` |
| Change health checks | `src/health/` |
| Change config knobs | `.env.example` (annotated), then read via `ConfigService` |
| Change deployment | `Dockerfile`, `render.yaml` |

## First-run setup

```bash
npm install                 # installs deps; Puppeteer pulls a Chromium build
docker compose up -d        # Redis (BullMQ's store)
cp .env.example .env        # config; edit if needed
npm run start:dev           # http://localhost:3333
npm test                    # 43 offline tests — run this before you touch code
```

Surfaces once running:
- REST API + Swagger: `http://localhost:3333/docs`
- Queue dashboard: `http://localhost:3333/admin/queues`
- Health: `http://localhost:3333/health`
- Live reference deployment: `https://showtimes-crawler.onrender.com`

## The golden-path workflow (follow this for any change)

1. **Read the three docs** and the file(s) you're about to touch. Match the
   existing style and the *why*-comments.
2. **Respect the non-negotiables** in [rules.md](./rules.md) §6 — spec endpoints,
   required stack, pluggable fetching, pure extraction, honesty principle.
3. **Write/adjust the unit test alongside the code.** Offline only — mock the
   queue/axios/fetchers; use fixture HTML for extraction. No test ⇒ not done.
4. **Verify:** `npx tsc --noEmit` (types) + `npm test` (green) + a manual curl
   against `localhost:3333` if you changed behavior.
5. **Commit** as one coherent, imperative-subject change with a *why* in the
   body. **No AI co-author trailer.** Don't push unless asked.
6. **Update [memory.md](./memory.md)** with a decision-log entry if you made a
   non-obvious choice; update [rules.md](./rules.md) if you changed a convention.

## Common tasks — the intended way

- **Add a fetch engine (e.g. Playwright):** create a class implementing
  `PageFetcher` in `fetcher/`, register it, and select it in `crawl.processor.ts`
  by the job's `engine` value. Don't touch extraction or the API.
- **Extract a new data point:** add it in `ExtractionService`, extend the result
  type in `crawl.types.ts` and the `CrawlResultDto`, add a fixture-based test.
- **Add a config knob:** add it to `.env.example` with a comment, read it via
  `ConfigService` with a sensible default, never hard-code.
- **Add durable history:** introduce a Postgres store behind a repository
  interface consumed by `CrawlService`; keep Redis as the live queue. (This is
  the documented next step, currently not implemented.)

## Guardrails for AI agents specifically

- **Don't fabricate capability.** If you stub or bound something, say so in code
  comments and [memory.md](./memory.md). This project is graded on defensibility.
- **Don't swap the required libraries** (Nest/Axios/Cheerio/BullMQ/Puppeteer/
  Swagger) — a human reviewer expects them.
- **Don't introduce a database, background cron, or external service** without it
  being asked for; prefer the smallest change that fits the existing shape.
- **Keep secrets out of git and proxy credentials masked** in any output.
- **Don't push, deploy, or open PRs** without explicit instruction.
- Prefer **editing the DTO** over hand-building response objects, and **adding a
  class** over branching an existing service, when extending behavior.

## Definition of done
Types clean · tests green (with a new test for new behavior) · manual curl sane ·
one clean commit · docs updated if a decision or convention changed.
