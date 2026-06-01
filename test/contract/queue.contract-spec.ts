/**
 * Phase 8B contract — proves a job enqueued through QueueService is
 * delivered to a Worker and reaches a completed state against a real
 * Redis broker. Mirrors the 8A redis-invalidation pattern.
 *
 * Skipped when REDIS_URL is unset (same gating as the database contract
 * tests against DATABASE_URL).
 */
import { ConfigService } from '@nestjs/config';
import { Worker } from 'bullmq';
import { QueueService } from '../../src/common/queue/queue.service';
import { QUEUE_NAMES } from '../../src/common/queue/queue-names';
import { loadEnv } from './helpers';

const env = loadEnv();
const shouldRun = env?.redisUrl;
const describeIfRedis = shouldRun ? describe : describe.skip;

describeIfRedis('Queue service (Phase 8B, end-to-end)', () => {
  const redisUrl = env!.redisUrl!;
  let queueService: QueueService;
  let worker: Worker | null = null;

  beforeAll(() => {
    const config = {
      get: (k: string) => (k === 'REDIS_URL' ? redisUrl : undefined),
    } as unknown as ConfigService;
    queueService = new QueueService(config);
    queueService.onModuleInit();
  });

  afterAll(async () => {
    await worker?.close();
    await queueService.onModuleDestroy();
  });

  it('enqueues a notification-delivery job and a worker processes it', async () => {
    // Stand up a one-shot worker that records the job it sees.
    const seen: Array<{ id: string; payload: unknown }> = [];
    worker = new Worker(
      QUEUE_NAMES.NotificationDelivery,
      async (job) => {
        seen.push({ id: job.id ?? '', payload: job.data });
        return { ok: true };
      },
      { connection: { url: redisUrl } },
    );
    // Wait for the worker to actually start (BullMQ workers boot async).
    await new Promise<void>((resolve) => {
      if (worker!.isRunning()) return resolve();
      worker!.on('ready', () => resolve());
    });

    const jobId = await queueService.enqueue(QUEUE_NAMES.NotificationDelivery, {
      tenantId: null,
      channel: 'email',
      recipient: 'contract@example.com',
      templateKey: 'phase8b-smoke',
      variables: { foo: 'bar' },
    });
    expect(jobId).toBeTruthy();

    // Poll until the worker has seen it (or timeout).
    const ok = await waitFor(() => seen.length > 0, 5000);
    expect(ok).toBe(true);
    expect(seen[0].id).toBe(jobId);
    expect(seen[0].payload).toMatchObject({
      channel: 'email',
      templateKey: 'phase8b-smoke',
    });
  });
});

async function waitFor(cond: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return cond();
}
