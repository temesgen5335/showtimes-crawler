import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { HealthIndicatorService } from '@nestjs/terminus';
import { Queue } from 'bullmq';
import { CRAWL_QUEUE } from '../crawl/crawl.types';

/**
 * Health of the crawl subsystem. Verifies the two things the service can't
 * function without:
 *   1. Redis is reachable (PING) — it's the queue's store;
 *   2. at least one worker is registered on the queue — otherwise jobs would
 *      enqueue but never be processed (a silent, dangerous failure mode).
 * Also surfaces current job counts, which are handy in a health payload.
 */
@Injectable()
export class QueueHealthIndicator {
  constructor(
    @InjectQueue(CRAWL_QUEUE) private readonly queue: Queue,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async check(key: string) {
    const indicator = this.healthIndicatorService.check(key);
    try {
      // The BullMQ client type is a minimal interface; narrow it to the
      // ioredis method we need.
      const client = (await this.queue.client) as unknown as {
        ping(): Promise<string>;
      };

      const pong = await client.ping();
      if (pong !== 'PONG') {
        return indicator.down({ redis: 'unexpected ping response' });
      }

      const workers = await this.queue.getWorkers();
      const counts = await this.queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
      );

      if (workers.length === 0) {
        return indicator.down({
          redis: 'up',
          workers: 0,
          message: 'no workers registered on the queue',
        });
      }

      return indicator.up({ redis: 'up', workers: workers.length, counts });
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : 'redis unreachable',
      });
    }
  }
}
