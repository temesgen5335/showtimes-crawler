# Context — Problem, Vision & Purpose

> Read this first. It explains *why* this project exists and *what* it is trying
> to be. For *how it's built* see [rules.md](./rules.md); for *what happened and
> why* see [memory.md](./memory.md); for *how to work in it* see
> [agent.md](./agent.md).

## Problem statement

Entertainment-data aggregation depends on continuously pulling structured data
from a very large, heterogeneous set of third-party websites. Those sites:

- vary wildly in structure, technology and quality;
- often defend themselves with anti-bot measures (rate limits, IP blocks,
  JS-only rendering, Cloudflare / Akamai, CAPTCHA);
- fail intermittently, so any fetch must be treated as unreliable by default.

A naive "fetch-in-the-request-handler" scraper does not survive contact with
this reality: it blocks callers, loses work on crash, can't retry or throttle
centrally, and can't scale beyond one machine.

**The problem this project solves:** provide a *queue-based crawling service*
that accepts a URL, does the slow/fragile fetching asynchronously in a worker,
extracts structured page data, and exposes the job lifecycle over a clean REST
API — with the anti-bot and scaling primitives (proxy rotation, UA rotation,
rate limiting, headless-browser fallback) already in place.

## Origin & scope

This repository was built as the **technical assessment for the Senior Crawler
Developer role at International Showtimes** (a Berlin-based entertainment-data
aggregator tracking 25,000+ sites across 120+ markets). It implements a two-part
task specification:

- **Part 1** — a Nest.js web crawler: Axios + Cheerio extraction, a BullMQ/Redis
  job queue, and a REST API (`POST /crawl`, `GET /status/:id`,
  `DELETE /cancel/:id`) documented with Swagger, plus unit tests.
- **Part 2** — anti-blocking: a Puppeteer headless-browser engine, rotating user
  agents, proxy/VPN rotation configured via environment variables, and rate
  limiting, plus unit tests.

Everything beyond that spec (Bull Board dashboard, `GET /crawls` history,
`GET /health` probe, Dockerfile, Render blueprint) is a deliberate,
clearly-scoped extension — see [memory.md](./memory.md).

## Vision — what the end product is

A single small service that is the **honest, defensible core** of a crawl
platform:

1. **Enqueue** any URL and get a job id back immediately.
2. A **worker** fetches the page — via cheap HTTP by default, or a headless
   browser when a site needs JS — while rotating identity (UA + proxy) and
   respecting a central rate limit.
3. **Extract** the canonical page data points: title, meta description, favicon,
   and the lists of script / stylesheet / image URLs (all resolved to absolute).
4. **Observe & control** the work: poll status, list history, watch the queue in
   a dashboard, cancel jobs, and health-check the whole subsystem.

The design goal is not "a big scraper" — it is a **small system whose shape
scales**: the same queue-first architecture goes from one URL to 25,000+ sites
by adding workers, not by rewriting. See the "Scaling to 25,000+ sites" section
of [`README.md`](../README.md) for that path.

## Guiding principle

**Honesty over impression.** Every feature here is something the author can
explain and defend from first principles. Where a capability is stubbed,
bounded, or deferred (e.g. no durable result store, no live CAPTCHA solver), it
is documented as such rather than faked. Onboarding developers and agents should
preserve this principle: build what you can stand behind, and write down what you
chose not to do and why.
