import { Test } from '@nestjs/testing';
import { CrawlController } from './crawl.controller';
import { CrawlService } from './crawl.service';

describe('CrawlController', () => {
  let controller: CrawlController;
  const crawlService = {
    enqueue: jest.fn(),
    getStatus: jest.fn(),
    cancel: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [CrawlController],
      providers: [{ provide: CrawlService, useValue: crawlService }],
    }).compile();
    controller = moduleRef.get(CrawlController);
  });

  it('POST /crawl delegates to the service with the validated DTO', async () => {
    const enqueued = { id: '1', url: 'https://example.com', state: 'waiting' };
    crawlService.enqueue.mockResolvedValue(enqueued);

    await expect(
      controller.enqueue({ url: 'https://example.com' }),
    ).resolves.toEqual(enqueued);
    expect(crawlService.enqueue).toHaveBeenCalledWith({
      url: 'https://example.com',
    });
  });

  it('GET /status/:id delegates to the service', async () => {
    const status = { id: '1', state: 'completed' };
    crawlService.getStatus.mockResolvedValue(status);

    await expect(controller.getStatus('1')).resolves.toEqual(status);
    expect(crawlService.getStatus).toHaveBeenCalledWith('1');
  });

  it('DELETE /cancel/:id delegates to the service', async () => {
    const cancelled = { id: '1', state: 'cancelled', message: 'removed' };
    crawlService.cancel.mockResolvedValue(cancelled);

    await expect(controller.cancel('1')).resolves.toEqual(cancelled);
    expect(crawlService.cancel).toHaveBeenCalledWith('1');
  });
});
