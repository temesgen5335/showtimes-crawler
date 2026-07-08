# CLAUDE.md — Start Here

This is a **queue-based web crawler** (Nest.js + BullMQ/Redis + Cheerio/Puppeteer)
exposing a REST API. Built as the Senior Crawler Developer assessment for
International Showtimes. Live: `https://showtimes-crawler.onrender.com`.

## Onboarding — read these before working (in order)

1. **[.claude/context.md](.claude/context.md)** — problem, vision, end-product purpose.
2. **[.claude/rules.md](.claude/rules.md)** — design choices, stack, conventions, non-negotiables.
3. **[.claude/memory.md](.claude/memory.md)** — build history & decision log (the *why*).
4. **[.claude/agent.md](.claude/agent.md)** — how to work here: file map, workflow, guardrails.

For run/deploy/API details see **[README.md](README.md)**.

## The one-paragraph model

`POST /crawl` enqueues a URL on a BullMQ queue (Redis); a worker
(`src/crawl/crawl.processor.ts`) picks it, rotates UA + proxy, fetches via a
pluggable `PageFetcher` (Axios `http` engine or Puppeteer `browser` engine), and
`ExtractionService` (Cheerio) pulls title/meta/favicon/script/stylesheet/image
data. Read results via `GET /status/:id`; also `GET /crawls` (history),
`DELETE /cancel/:id`, `GET /health`, Swagger at `/docs`, Bull Board at
`/admin/queues`.

## Quick commands

```bash
npm install && docker compose up -d && cp .env.example .env
npm run start:dev     # http://localhost:3333
npm test              # 43 offline tests — keep green
npx tsc --noEmit      # type check
```

## Non-negotiables (full list in .claude/rules.md §6)

- Keep the 3 spec endpoints and the required stack (Nest/Axios/Cheerio/BullMQ/
  Puppeteer/Swagger).
- Fetching stays pluggable; extraction stays pure & I/O-free.
- Every new behavior gets an offline unit test.
- **Honesty principle:** don't fake capability; document what's stubbed/bounded.
- Clean commits, **no AI co-author trailer**; don't push/deploy without being asked.
