import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CrawlEnqueuedDto {
  @ApiProperty({ example: '1', description: 'BullMQ job id — use it with /status and /cancel' })
  id!: string;

  @ApiProperty({ example: 'https://www.kino.de' })
  url!: string;

  @ApiProperty({ example: 'waiting' })
  state!: string;
}

export class CrawlResultDto {
  @ApiProperty({ example: 'https://www.kino.de' })
  requestedUrl!: string;

  @ApiProperty({ example: 'https://www.kino.de/', description: 'URL after redirects' })
  finalUrl!: string;

  @ApiPropertyOptional({ example: 200, nullable: true })
  statusCode!: number | null;

  @ApiProperty({ enum: ['http', 'browser'], example: 'http' })
  fetchedWith!: string;

  @ApiProperty({ description: 'User agent used for this fetch (rotated)' })
  userAgent!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Proxy used (credentials stripped), or null for a direct fetch' })
  proxy!: string | null;

  @ApiPropertyOptional({ example: 'Kino.de – Dein Kinoportal', nullable: true })
  title!: string | null;

  @ApiPropertyOptional({ nullable: true })
  metaDescription!: string | null;

  @ApiPropertyOptional({ example: 'https://www.kino.de/favicon.ico', nullable: true })
  favicon!: string | null;

  @ApiProperty({ type: [String], description: 'Absolute script URLs' })
  scripts!: string[];

  @ApiProperty({ type: [String], description: 'Absolute stylesheet URLs' })
  stylesheets!: string[];

  @ApiProperty({ type: [String], description: 'Absolute image URLs' })
  images!: string[];

  @ApiProperty({ example: '2026-07-04T12:00:00.000Z' })
  fetchedAt!: string;

  @ApiProperty({ example: 843 })
  durationMs!: number;
}

export class CrawlStatusDto {
  @ApiProperty({ example: '1' })
  id!: string;

  @ApiProperty({ example: 'https://www.kino.de' })
  url!: string;

  @ApiProperty({
    example: 'completed',
    description: 'BullMQ job state: waiting | active | completed | failed | delayed',
  })
  state!: string;

  @ApiProperty({ example: 100, description: 'Progress 0–100' })
  progress!: number | object | string;

  @ApiProperty({ example: 1 })
  attemptsMade!: number;

  @ApiProperty({ example: '2026-07-04T12:00:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({ nullable: true })
  processedAt!: string | null;

  @ApiPropertyOptional({ nullable: true })
  finishedAt!: string | null;

  @ApiPropertyOptional({ type: CrawlResultDto, nullable: true, description: 'Present when state = completed' })
  result!: CrawlResultDto | null;

  @ApiPropertyOptional({ nullable: true, description: 'Present when state = failed' })
  failedReason!: string | null;
}

export class CancelResultDto {
  @ApiProperty({ example: '1' })
  id!: string;

  @ApiProperty({
    example: 'cancelled',
    description:
      '"cancelled" if the job was removed from the queue; "cancelling" if it was active and will abort at the next checkpoint',
  })
  state!: string;

  @ApiProperty()
  message!: string;
}
