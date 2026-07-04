import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { QueueHealthIndicator } from './queue-health.indicator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly queueHealth: QueueHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({
    summary: 'Liveness/readiness probe',
    description:
      'Returns 200 when Redis is reachable and at least one worker is ' +
      'registered on the queue; 503 otherwise. Used as the platform health ' +
      'check (see render.yaml).',
  })
  check() {
    return this.health.check([() => this.queueHealth.check('crawl-queue')]);
  }
}
