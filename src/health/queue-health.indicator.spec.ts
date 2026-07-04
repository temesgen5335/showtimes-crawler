import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { HealthIndicatorService } from '@nestjs/terminus';
import { QueueHealthIndicator } from './queue-health.indicator';
import { CRAWL_QUEUE } from '../crawl/crawl.types';

describe('QueueHealthIndicator', () => {
  let indicator: QueueHealthIndicator;
  const client = { ping: jest.fn() };
  const queue = {
    client: Promise.resolve(client),
    getWorkers: jest.fn(),
    getJobCounts: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        QueueHealthIndicator,
        HealthIndicatorService,
        { provide: getQueueToken(CRAWL_QUEUE), useValue: queue },
      ],
    }).compile();
    indicator = moduleRef.get(QueueHealthIndicator);
  });

  it('reports up when Redis pings and a worker is registered', async () => {
    client.ping.mockResolvedValue('PONG');
    queue.getWorkers.mockResolvedValue([{ id: 'w1' }]);
    queue.getJobCounts.mockResolvedValue({ waiting: 0, active: 1 });

    const result: any = await indicator.check('crawl-queue');
    expect(result['crawl-queue'].status).toBe('up');
    expect(result['crawl-queue'].workers).toBe(1);
  });

  it('reports down when no workers are registered', async () => {
    client.ping.mockResolvedValue('PONG');
    queue.getWorkers.mockResolvedValue([]);
    queue.getJobCounts.mockResolvedValue({});

    const result: any = await indicator.check('crawl-queue');
    expect(result['crawl-queue'].status).toBe('down');
    expect(result['crawl-queue'].workers).toBe(0);
  });

  it('reports down when Redis is unreachable', async () => {
    client.ping.mockRejectedValue(new Error('connection refused'));

    const result: any = await indicator.check('crawl-queue');
    expect(result['crawl-queue'].status).toBe('down');
    expect(result['crawl-queue'].message).toContain('connection refused');
  });
});
