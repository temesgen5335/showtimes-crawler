import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CrawlService } from './crawl.service';
import { CreateCrawlDto } from './dto/create-crawl.dto';
import { ListCrawlsQueryDto } from './dto/list-crawls.dto';
import {
  CancelResultDto,
  CrawlEnqueuedDto,
  CrawlListDto,
  CrawlStatusDto,
} from './dto/crawl-responses.dto';

@ApiTags('crawl')
@Controller()
export class CrawlController {
  constructor(private readonly crawlService: CrawlService) {}

  @Post('crawl')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Enqueue a crawl job',
    description:
      'Accepts a URL and enqueues a crawl job. Returns immediately with the job id; poll GET /status/{id} for the result.',
  })
  @ApiCreatedResponse({ type: CrawlEnqueuedDto })
  enqueue(@Body() dto: CreateCrawlDto): Promise<CrawlEnqueuedDto> {
    return this.crawlService.enqueue(dto);
  }

  @Get('crawls')
  @ApiOperation({
    summary: 'List recent crawl jobs (history)',
    description:
      'Paginated list of crawl jobs held in Redis, most recent first. ' +
      'Complements GET /status/{id}; bounded by the queue retention window.',
  })
  @ApiOkResponse({ type: CrawlListDto })
  list(@Query() query: ListCrawlsQueryDto): Promise<CrawlListDto> {
    return this.crawlService.list(query);
  }

  @Get('status/:id')
  @ApiOperation({
    summary: 'Get the status (and result) of a crawl job',
  })
  @ApiParam({ name: 'id', description: 'Job id returned by POST /crawl' })
  @ApiOkResponse({ type: CrawlStatusDto })
  @ApiNotFoundResponse({ description: 'Unknown job id' })
  getStatus(@Param('id') id: string): Promise<CrawlStatusDto> {
    return this.crawlService.getStatus(id);
  }

  @Delete('cancel/:id')
  @ApiOperation({
    summary: 'Cancel a crawl job',
    description:
      'Removes a queued job, or requests cooperative cancellation of an active one.',
  })
  @ApiParam({ name: 'id', description: 'Job id returned by POST /crawl' })
  @ApiOkResponse({ type: CancelResultDto })
  @ApiNotFoundResponse({ description: 'Unknown job id' })
  @ApiConflictResponse({ description: 'Job already completed or failed' })
  cancel(@Param('id') id: string): Promise<CancelResultDto> {
    return this.crawlService.cancel(id);
  }
}
