import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { BullModule } from '@nestjs/bullmq';
import { CRAWL_QUEUE } from '../crawl/crawl.types';
import { HealthController } from './health.controller';
import { QueueHealthIndicator } from './queue-health.indicator';

@Module({
  imports: [
    TerminusModule,
    // Re-register the queue by name so the indicator can inject it and reach
    // the same underlying Redis connection / worker registry.
    BullModule.registerQueue({ name: CRAWL_QUEUE }),
  ],
  controllers: [HealthController],
  providers: [QueueHealthIndicator],
})
export class HealthModule {}
