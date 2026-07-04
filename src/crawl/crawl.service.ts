import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CRAWL_QUEUE, CrawlJobData, CrawlResult } from './crawl.types';
import { CreateCrawlDto } from './dto/create-crawl.dto';
import {
  CancelResultDto,
  CrawlEnqueuedDto,
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
