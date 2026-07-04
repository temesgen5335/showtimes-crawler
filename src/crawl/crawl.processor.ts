import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue, UnrecoverableError } from 'bullmq';
import {
  CRAWL_QUEUE,
  CrawlJobData,
  CrawlResult,
  FetchEngine,
} from './crawl.types';
import { ExtractionService } from './extraction/extraction.service';
import { AxiosFetcher } from './fetcher/axios.fetcher';
import { PuppeteerFetcher } from './fetcher/puppeteer.fetcher';
import { PageFetcher } from './fetcher/page-fetcher.interface';
import { UserAgentRotator } from './anti-blocking/user-agent.rotator';
import { ProxyRotator } from './anti-blocking/proxy.rotator';

const toInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * BullMQ worker. Rate limiting (Part 2) happens here: the worker processes
 * at most RATE_LIMIT_MAX jobs per RATE_LIMIT_DURATION_MS window, so a burst
 * of API calls cannot overload the target site or burn the proxy pool.
 * Values are read from process.env at decoration time (dotenv is loaded
 * first in main.ts) because decorator options must be static.
 */
@Processor(CRAWL_QUEUE, {
  concurrency: toInt(process.env.WORKER_CONCURRENCY, 3),
  limiter: {
    max: toInt(process.env.RATE_LIMIT_MAX, 5),
    duration: toInt(process.env.RATE_LIMIT_DURATION_MS, 1000),
  },
})
export class CrawlProcessor extends WorkerHost {
  private readonly logger = new Logger(CrawlProcessor.name);

  constructor(
    @InjectQueue(CRAWL_QUEUE)
    private readonly queue: Queue<CrawlJobData, CrawlResult>,
    private readonly config: ConfigService,
    private readonly extraction: ExtractionService,
    private readonly axiosFetcher: AxiosFetcher,
    private readonly puppeteerFetcher: PuppeteerFetcher,
    private readonly userAgents: UserAgentRotator,
    private readonly proxies: ProxyRotator,
  ) {
    super();
  }

  async process(job: Job<CrawlJobData, CrawlResult>): Promise<CrawlResult> {
    const startedAt = Date.now();
    await this.assertNotCancelled(job);

    const engine: FetchEngine =
      job.data.engine ?? this.config.get<FetchEngine>('FETCH_ENGINE', 'http');
    const fetcher: PageFetcher =
      engine === 'browser' ? this.puppeteerFetcher : this.axiosFetcher;

    const fetchOptions = {
      userAgent: this.userAgents.next(),
      proxyUrl: this.proxies.next(),
      timeoutMs: toInt(this.config.get<string>('FETCH_TIMEOUT_MS'), 15000),
    };

    this.logger.log(
      `Job ${job.id}: fetching ${job.data.url} [engine=${engine}, proxy=${
        ProxyRotator.mask(fetchOptions.proxyUrl) ?? 'direct'
      }]`,
    );
    await job.updateProgress(10);

    const page = await fetcher.fetch(job.data.url, fetchOptions);
    await job.updateProgress(70);

    // Checkpoint: a cancel may have arrived while the fetch was in flight.
    await this.assertNotCancelled(job);

    const extracted = this.extraction.extract(page.html, page.finalUrl);
    await job.updateProgress(100);

    return {
      requestedUrl: job.data.url,
      finalUrl: page.finalUrl,
      statusCode: page.statusCode,
      fetchedWith: engine,
      userAgent: fetchOptions.userAgent,
      proxy: ProxyRotator.mask(fetchOptions.proxyUrl),
      ...extracted,
      fetchedAt: new Date(startedAt).toISOString(),
      durationMs: Date.now() - startedAt,
    };
  }

  /**
   * Cooperative cancellation: DELETE /cancel/{id} sets cancelRequested on
   * the job's data while it is active. Re-read the job (the in-memory copy
   * is a snapshot) and abort with UnrecoverableError so BullMQ fails the
   * job immediately instead of retrying it.
   */
  private async assertNotCancelled(
    job: Job<CrawlJobData, CrawlResult>,
  ): Promise<void> {
    if (!job.id) return;
    const fresh = await this.queue.getJob(job.id);
    if (fresh?.data.cancelRequested) {
      throw new UnrecoverableError('Cancelled by user');
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<CrawlJobData, CrawlResult>): void {
    this.logger.log(`Job ${job.id}: completed in ${job.returnvalue?.durationMs}ms`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<CrawlJobData, CrawlResult> | undefined, error: Error): void {
    this.logger.warn(
      `Job ${job?.id}: failed (attempt ${job?.attemptsMade}) — ${error.message}`,
    );
  }
}
