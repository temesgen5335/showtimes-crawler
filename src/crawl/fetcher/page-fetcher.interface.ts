export interface FetchOptions {
  userAgent: string;
  /** Full proxy URL (may contain credentials), or null to fetch directly. */
  proxyUrl: string | null;
  timeoutMs: number;
}

export interface FetchedPage {
  html: string;
  /** URL after redirects — used as the base for resolving relative URLs. */
  finalUrl: string;
  statusCode: number | null;
}

/**
 * Strategy interface: Part 1 uses the Axios implementation, Part 2 adds a
 * Puppeteer implementation for JS-rendered pages. The processor picks one
 * per job, so new engines (e.g. Playwright, a flaresolverr proxy) slot in
 * without touching queue or extraction code.
 */
export interface PageFetcher {
  fetch(url: string, options: FetchOptions): Promise<FetchedPage>;
}
