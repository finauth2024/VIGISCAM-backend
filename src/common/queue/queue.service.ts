import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { QueueName, QueuePayloads, QUEUE_NAMES } from './queue-names';

/**
 * Typed wrapper around BullMQ queues, sharing the Phase 8A Redis connection.
 *
 * **Graceful degradation** — when `REDIS_URL` is unset (local dev, unit
 * tests), enqueueing is a no-op that logs a WARN. This means a developer
 * can run the API + write code that enqueues jobs without standing up
 * Redis locally; the job simply doesn't fire until a Redis-backed env
 * picks up the same code.
 *
 * **Retry policy** — every queue gets a default 3-attempt exponential
 * backoff, overridable per enqueue() call. Permanently failed jobs land
 * in BullMQ's built-in `failed` set (queryable via the worker process or
 * a future admin endpoint).
 *
 * Processors are NOT registered here. Each consuming module
 * (notifications, walletguard, claimverify, …) registers its own Worker
 * for the queue it owns. That keeps the substrate small and avoids a
 * fan-out import graph from this module into every Phase 9 module.
 */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues = new Map<QueueName, Queue>();
  private redisUrl: string | undefined;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.redisUrl = this.config.get<string>('REDIS_URL');
    if (!this.redisUrl) {
      this.logger.warn(
        'No REDIS_URL — queue enqueue is a no-op. Set REDIS_URL to ' +
          'enable background processing.',
      );
      return;
    }
    for (const name of Object.values(QUEUE_NAMES)) {
      this.queues.set(
        name,
        new Queue(name, {
          connection: { url: this.redisUrl },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
            removeOnComplete: { age: 60 * 60, count: 1000 },
            removeOnFail: { age: 24 * 60 * 60 },
          },
        }),
      );
    }
    this.logger.log(`Queues ready: ${[...this.queues.keys()].join(', ')}`);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([...this.queues.values()].map((q) => q.close()));
    this.queues.clear();
  }

  /**
   * Enqueue a typed job. Returns the BullMQ jobId when Redis is configured,
   * or null in single-process mode (the call is a no-op).
   */
  async enqueue<N extends QueueName>(
    name: N,
    payload: QueuePayloads[N],
    opts?: {
      /** Override default attempts for this job. */
      attempts?: number;
      /** Delay job execution by N ms. */
      delayMs?: number;
      /** Job-level idempotency key — BullMQ dedupes within a queue. */
      jobId?: string;
    },
  ): Promise<string | null> {
    const queue = this.queues.get(name);
    if (!queue) {
      this.logger.warn(
        `Skipping enqueue on "${name}" — no Redis connection. ` + 'Payload was dropped.',
      );
      return null;
    }
    const job = await queue.add(name, payload, {
      attempts: opts?.attempts,
      delay: opts?.delayMs,
      jobId: opts?.jobId,
    });
    return job.id ?? null;
  }

  /**
   * Expose the underlying Queue so consuming modules can register their
   * own Workers without re-creating the connection. Returns null when
   * Redis is unset (the consuming module's worker should also be a no-op).
   */
  getQueue<N extends QueueName>(name: N): Queue | null {
    return this.queues.get(name) ?? null;
  }

  /** Test/observability — current Redis URL (or undefined). */
  getRedisUrl(): string | undefined {
    return this.redisUrl;
  }
}
