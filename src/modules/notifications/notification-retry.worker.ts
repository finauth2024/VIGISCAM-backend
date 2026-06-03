import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { NotificationDeliveryPayload, QUEUE_NAMES } from '../../common/queue/queue-names';
import { QueueService } from '../../common/queue/queue.service';
import { WorkerHealthRegistry } from '../../common/queue/worker-health.registry';
import { NotificationService } from './notification.service';

const WORKER_NAME = 'notification-retry-worker';

/**
 * CP-9 — the BullMQ worker that re-attempts failed notification deliveries
 * (reviewer #10 "add retry logic through BullMQ"). Backoff + attempt cap come
 * from the queue's defaultJobOptions (3 attempts, exponential). Graceful
 * degradation: when REDIS_URL is unset the worker is disabled (the initial
 * synchronous send still records the delivery row + failure).
 */
@Injectable()
export class NotificationRetryWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationRetryWorker.name);
  private worker?: Worker;

  constructor(
    private readonly queue: QueueService,
    private readonly notifications: NotificationService,
    private readonly health: WorkerHealthRegistry,
  ) {}

  onModuleInit(): void {
    const url = this.queue.getRedisUrl();
    if (!url) {
      this.logger.warn('No REDIS_URL — notification retry worker disabled.');
      return;
    }
    this.worker = new Worker(
      QUEUE_NAMES.NotificationDelivery,
      async (job) => {
        await this.notifications.retryFromQueue(job.data as NotificationDeliveryPayload);
      },
      { connection: { url } },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`notification retry job ${job?.id} failed: ${err?.message}`),
    );
    this.health.register(WORKER_NAME, QUEUE_NAMES.NotificationDelivery);
    this.logger.log('Notification retry worker started.');
  }

  async onModuleDestroy(): Promise<void> {
    this.health.markStopped(WORKER_NAME);
    await this.worker?.close();
  }
}
