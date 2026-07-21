import { Module } from '@nestjs/common';
import { RoadmapController } from './roadmap.controller';

@Module({
  controllers: [RoadmapController],
})
export class RoadmapModule {}
