export const CRAWL_QUEUE = 'crawl';

export type FetchEngine = 'http' | 'browser';

export interface CrawlJobData {
  url: string;
  engine?: FetchEngine;
  /**
   * Cooperative cancellation flag. Set via DELETE /cancel/{id} while the job
   * is active; the worker checks it at safe checkpoints and aborts.
   */
  cancelRequested?: boolean;
}

export interface ExtractedPageData {
  title: string | null;
  metaDescription: string | null;
  favicon: string | null;
  scripts: string[];
  stylesheets: string[];
  images: string[];
}

export interface CrawlResult extends ExtractedPageData {
  requestedUrl: string;
  finalUrl: string;
  statusCode: number | null;
  fetchedWith: FetchEngine;
  userAgent: string;
  /** Proxy used for this fetch with credentials stripped, or null. */
  proxy: string | null;
  fetchedAt: string;
  durationMs: number;
}
