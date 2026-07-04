import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { ExpressAdapter } from '@bull-board/express';
import { CrawlModule } from './crawl/crawl.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
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
  ],
})
export class AppModule {}
