import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { CRAWL_QUEUE } from './crawl.types';
import { CrawlController } from './crawl.controller';
import { CrawlService } from './crawl.service';
import { CrawlProcessor } from './crawl.processor';
import { ExtractionService } from './extraction/extraction.service';
import { AxiosFetcher } from './fetcher/axios.fetcher';
import { PuppeteerFetcher } from './fetcher/puppeteer.fetcher';
import { UserAgentRotator } from './anti-blocking/user-agent.rotator';
import { ProxyRotator } from './anti-blocking/proxy.rotator';

@Module({
  imports: [
    BullModule.registerQueueAsync({
      name: CRAWL_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        defaultJobOptions: {
          attempts: Number(config.get('JOB_ATTEMPTS', 2)),
          backoff: { type: 'exponential', delay: 1000 },
          // Keep finished jobs for a day so /status stays answerable.
          removeOnComplete: { age: 24 * 3600 },
          removeOnFail: { age: 24 * 3600 },
        },
      }),
    }),
    // Expose this queue in the Bull Board dashboard (mounted in AppModule).
    BullBoardModule.forFeature({
      name: CRAWL_QUEUE,
      adapter: BullMQAdapter,
    }),
  ],
  controllers: [CrawlController],
  providers: [
    CrawlService,
    CrawlProcessor,
    ExtractionService,
    AxiosFetcher,
    PuppeteerFetcher,
    UserAgentRotator,
    ProxyRotator,
  ],
})
export class CrawlModule {}
