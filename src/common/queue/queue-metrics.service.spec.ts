import { QueueService } from './queue.service';
import { QueueMetricsService } from './queue-metrics.service';
import { WorkerHealthRegistry } from './worker-health.registry';

describe('QueueMetricsService', () => {
  it('reports redis status, registered workers, and per-queue counts + hasWorker', async () => {
    const health = new WorkerHealthRegistry();
    health.register('notification-retry-worker', 'notification-delivery');

    const queue = {
      getRedisUrl: () => 'redis://x',
      getQueue: (name: string) =>
        name === 'notification-delivery'
          ? { getJobCounts: async () => ({ waiting: 2, active: 1, failed: 0, completed: 5 }) }
          : null,
    } as unknown as QueueService;

    const metrics = await new QueueMetricsService(queue, health).getMetrics();

    expect(metrics.redisConnected).toBe(true);
    expect(metrics.workers).toHaveLength(1);
    const nd = metrics.queues.find((q) => q.queue === 'notification-delivery');
    expect(nd?.hasWorker).toBe(true);
    expect(nd?.counts).toMatchObject({ waiting: 2, failed: 0 });
    // A queue with no worker + no live queue object reports hasWorker:false.
    const other = metrics.queues.find((q) => q.queue === 'risk-processing');
    expect(other?.hasWorker).toBe(false);
    expect(other?.counts).toBeNull();
  });

  it('reports redisConnected:false when REDIS_URL is unset', async () => {
    const queue = {
      getRedisUrl: () => undefined,
      getQueue: () => null,
    } as unknown as QueueService;
    const metrics = await new QueueMetricsService(queue, new WorkerHealthRegistry()).getMetrics();
    expect(metrics.redisConnected).toBe(false);
    expect(metrics.workers).toEqual([]);
  });
});
