import { ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';
import { QUEUE_NAMES } from './queue-names';

/**
 * Unit tests cover graceful-degradation only. The real enqueue → process
 * → complete round-trip is exercised by the contract suite against a
 * live Redis (see test/contract/queue.contract-spec.ts).
 */
describe('QueueService (no REDIS_URL)', () => {
  const noRedisConfig = {
    get: () => undefined,
  } as unknown as ConfigService;

  let queue: QueueService;
  beforeEach(() => {
    queue = new QueueService(noRedisConfig);
    queue.onModuleInit();
  });

  afterEach(async () => {
    await queue.onModuleDestroy();
  });

  it('reports no Redis URL', () => {
    expect(queue.getRedisUrl()).toBeUndefined();
  });

  it('getQueue returns null for every queue name', () => {
    for (const name of Object.values(QUEUE_NAMES)) {
      expect(queue.getQueue(name)).toBeNull();
    }
  });

  it('enqueue silently drops jobs and returns null', async () => {
    const jobId = await queue.enqueue(QUEUE_NAMES.NotificationDelivery, {
      tenantId: null,
      channel: 'email',
        deliveryId: 'd-test',
        subject: 'S',
        body: 'B',
      recipient: 'test@example.com',
      templateKey: 'welcome',
    });
    expect(jobId).toBeNull();
  });

  it('onModuleDestroy is safe with no queues', async () => {
    await expect(queue.onModuleDestroy()).resolves.not.toThrow();
  });
});
