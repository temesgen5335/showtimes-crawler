import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, JobState, Queue } from 'bullmq';
import { CRAWL_QUEUE, CrawlJobData, CrawlResult } from './crawl.types';
import { CreateCrawlDto } from './dto/create-crawl.dto';
import { ListCrawlsQueryDto } from './dto/list-crawls.dto';
import {
  CancelResultDto,
  CrawlEnqueuedDto,
  CrawlListDto,
  CrawlStatusDto,
} from './dto/crawl-responses.dto';

@Injectable()
export class CrawlService {
  constructor(
    @InjectQueue(CRAWL_QUEUE)
    private readonly queue: Queue<CrawlJobData, CrawlResult>,
  ) {}

  async enqueue(dto: CreateCrawlDto): Promise<CrawlEnqueuedDto> {
    const job = await this.queue.add('crawl-page', {
      url: dto.url,
      engine: dto.engine,
    });
    return { id: String(job.id), url: dto.url, state: 'waiting' };
  }

  async getStatus(id: string): Promise<CrawlStatusDto> {
    const job = await this.queue.getJob(id);
    if (!job) throw new NotFoundException(`No crawl job with id "${id}"`);
    const state = await job.getState();
    return this.toStatusDto(job, state);
  }

  /**
   * Lists crawl jobs currently held in Redis, most recent first — a history
   * view to complement GET /status/:id. Bounded by the queue's 24h retention;
   * this is not a durable audit log (that would be a Postgres store — see the
   * README scale notes). Paginated to keep responses and Redis reads bounded.
   */
  async list(query: ListCrawlsQueryDto): Promise<CrawlListDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const start = (page - 1) * limit;
    const end = start + limit - 1;

    // Default to the states that make up "history"; allow narrowing to one.
    const states: JobState[] = query.state
      ? [query.state]
      : ['active', 'waiting', 'delayed', 'completed', 'failed'];

    const counts = await this.queue.getJobCounts(...states);
    const total = states.reduce((sum, s) => sum + (counts[s] ?? 0), 0);

    // BullMQ's getJobs applies the [start,end] range per state bucket and does
    // not order across buckets, so we fetch the candidate window (0..end) from
    // each state, merge, sort newest-first by enqueue time, then slice the
    // requested page. Bounded by `end`, which is fine within the retention
    // window; a durable store would paginate this in SQL instead.
    const jobs = await this.queue.getJobs(states, 0, end);
    const ordered = jobs
      .filter((job): job is Job<CrawlJobData, CrawlResult> => Boolean(job))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(start, start + limit);

    const items = await Promise.all(
      ordered.map(async (job) => this.toStatusDto(job, await job.getState())),
    );

    return { page, limit, total, count: items.length, items };
  }

  private toStatusDto(
    job: Job<CrawlJobData, CrawlResult>,
    state: string,
  ): CrawlStatusDto {
    return {
      id: String(job.id),
      url: job.data.url,
      state,
      // JobProgress may be number | string | boolean | object; we only ever
      // set numeric progress, so normalise anything else to 0.
      progress: typeof job.progress === 'number' ? job.progress : 0,
      attemptsMade: job.attemptsMade,
      createdAt: new Date(job.timestamp).toISOString(),
      processedAt: job.processedOn
        ? new Date(job.processedOn).toISOString()
        : null,
      finishedAt: job.finishedOn
        ? new Date(job.finishedOn).toISOString()
        : null,
      result: state === 'completed' ? job.returnvalue : null,
      failedReason: state === 'failed' ? (job.failedReason ?? null) : null,
    };
  }

  /**
   * Cancellation semantics:
   *  - waiting/delayed jobs are removed from the queue outright;
   *  - active jobs cannot be safely killed mid-flight, so we flag them for
   *    cooperative cancellation — the worker checks the flag at checkpoints
   *    (before fetch, after fetch) and aborts;
   *  - finished jobs cannot be cancelled (409).
   */
  async cancel(id: string): Promise<CancelResultDto> {
    const job = await this.queue.getJob(id);
    if (!job) throw new NotFoundException(`No crawl job with id "${id}"`);

    const state = await job.getState();
    if (state === 'completed' || state === 'failed') {
      throw new ConflictException(
        `Job "${id}" has already ${state} and cannot be cancelled`,
      );
    }

    if (state === 'active') {
      await job.updateData({ ...job.data, cancelRequested: true });
      return {
        id: String(job.id),
        state: 'cancelling',
        message:
          'Job is currently being processed; cancellation was requested and the worker will abort at its next checkpoint.',
      };
    }

    await job.remove();
    return {
      id: String(job.id),
      state: 'cancelled',
      message: 'Job removed from the queue before processing started.',
    };
  }
}
