import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { JobState } from 'bullmq';

const LISTABLE_STATES = [
  'active',
  'waiting',
  'delayed',
  'completed',
  'failed',
] as const;

export class ListCrawlsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1, description: '1-based page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 100,
    default: 20,
    description: 'Page size',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    enum: LISTABLE_STATES,
    description: 'Filter to a single job state; omit for all history',
  })
  @IsOptional()
  @IsIn(LISTABLE_STATES)
  state?: JobState;
}
