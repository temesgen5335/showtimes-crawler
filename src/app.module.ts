import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { CrawlModule } from './crawl/crawl.module';
import { HealthModule } from './health/health.module';
import { buildRedisConnection } from './redis.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: buildRedisConnection(config),
      }),
    }),
    // Bull Board: a read-only web dashboard for the queue — inspect waiting/
    // active/completed/failed jobs, their data, results and errors. Mounted
    // at BULL_BOARD_ROUTE (default /admin/queues). Individual queues attach
    // to it via BullBoardModule.forFeature (see CrawlModule).
    BullBoardModule.forRoot({
      route: process.env.BULL_BOARD_ROUTE ?? '/admin/queues',
      adapter: ExpressAdapter,
    }),
    CrawlModule,
    HealthModule,
  ],
})
export class AppModule {}
