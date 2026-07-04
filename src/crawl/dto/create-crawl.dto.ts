import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUrl } from 'class-validator';
import type { FetchEngine } from '../crawl.types';

export class CreateCrawlDto {
  @ApiProperty({
    description: 'Absolute http(s) URL to crawl',
    example: 'https://www.kino.de',
  })
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'url must be an absolute http(s) URL' },
  )
  url!: string;

  @ApiPropertyOptional({
    description:
      'Fetch engine for this job. "http" = Axios + Cheerio (fast, static HTML). ' +
      '"browser" = Puppeteer headless Chrome (JS-rendered pages). ' +
      'Defaults to the FETCH_ENGINE env setting.',
    enum: ['http', 'browser'],
    example: 'http',
  })
  @IsOptional()
  @IsIn(['http', 'browser'])
  engine?: FetchEngine;
}
