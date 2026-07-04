import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { CrawlService } from './crawl.service';
import { CRAWL_QUEUE } from './crawl.types';

type MockJob = {
  id: string;
  data: { url: string; cancelRequested?: boolean };
  progress: number;
  attemptsMade: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  returnvalue?: unknown;
  failedReason?: string;
  getState: jest.Mock;
  remove: jest.Mock;
  updateData: jest.Mock;
};

const makeJob = (overrides: Partial<MockJob> = {}): MockJob => ({
  id: '42',
  data: { url: 'https://example.com' },
  progress: 0,
  attemptsMade: 0,
  timestamp: 1_700_000_000_000,
  getState: jest.fn().mockResolvedValue('waiting'),
  remove: jest.fn().mockResolvedValue(undefined),
  updateData: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

describe('CrawlService', () => {
  let service: CrawlService;
  const queue = {
    add: jest.fn(),
    getJob: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CrawlService,
        { provide: getQueueToken(CRAWL_QUEUE), useValue: queue },
      ],
    }).compile();
    service = moduleRef.get(CrawlService);
  });

  describe('enqueue', () => {
    it('adds a job to the queue and returns its id', async () => {
      queue.add.mockResolvedValue({ id: '7' });
      const response = await service.enqueue({
        url: 'https://example.com',
        engine: 'browser',
      });
      expect(queue.add).toHaveBeenCalledWith('crawl-page', {
        url: 'https://example.com',
        engine: 'browser',
      });
      expect(response).toEqual({
        id: '7',
        url: 'https://example.com',
        state: 'waiting',
      });
    });
  });

  describe('getStatus', () => {
    it('throws 404 for an unknown job id', async () => {
      queue.getJob.mockResolvedValue(undefined);
      await expect(service.getStatus('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns the result for a completed job', async () => {
      const job = makeJob({
        progress: 100,
        finishedOn: 1_700_000_005_000,
        returnvalue: { title: 'Example' },
      });
      job.getState.mockResolvedValue('completed');
      queue.getJob.mockResolvedValue(job);

      const status = await service.getStatus('42');
      expect(status.state).toBe('completed');
      expect(status.result).toEqual({ title: 'Example' });
      expect(status.failedReason).toBeNull();
    });

    it('returns the failure reason for a failed job', async () => {
      const job = makeJob({ failedReason: 'timeout of 15000ms exceeded' });
      job.getState.mockResolvedValue('failed');
      queue.getJob.mockResolvedValue(job);

      const status = await service.getStatus('42');
      expect(status.state).toBe('failed');
      expect(status.result).toBeNull();
      expect(status.failedReason).toBe('timeout of 15000ms exceeded');
    });
  });

  describe('cancel', () => {
    it('throws 404 for an unknown job id', async () => {
      queue.getJob.mockResolvedValue(undefined);
      await expect(service.cancel('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('removes a waiting job from the queue', async () => {
      const job = makeJob();
      queue.getJob.mockResolvedValue(job);

      const response = await service.cancel('42');
      expect(job.remove).toHaveBeenCalled();
      expect(response.state).toBe('cancelled');
    });

    it('flags an active job for cooperative cancellation', async () => {
      const job = makeJob();
      job.getState.mockResolvedValue('active');
      queue.getJob.mockResolvedValue(job);

      const response = await service.cancel('42');
      expect(job.remove).not.toHaveBeenCalled();
      expect(job.updateData).toHaveBeenCalledWith(
        expect.objectContaining({ cancelRequested: true }),
      );
      expect(response.state).toBe('cancelling');
    });

    it('rejects cancelling a finished job with 409', async () => {
      const job = makeJob();
      job.getState.mockResolvedValue('completed');
      queue.getJob.mockResolvedValue(job);

      await expect(service.cancel('42')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
