import { Injectable } from '@nestjs/common';
import { QUEUE_NAMES } from './queue-names';
import { QueueService } from './queue.service';
import { WorkerHealth, WorkerHealthRegistry } from './worker-health.registry';

export interface QueueMetric {
  queue: string;
  /** True when this queue has a registered worker. */
  hasWorker: boolean;
  counts: Record<string, number> | null;
}

export interface QueueMetricsResult {
  redisConnected: boolean;
  workers: WorkerHealth[];
  queues: QueueMetric[];
}

/**
 * CP-10 — queue + worker observability (reviewer #11 "queue dashboards or admin
 * metrics"). Reports Redis connectivity, the registered workers, and per-queue
 * BullMQ job counts (waiting / active / completed / failed / delayed / paused).
 */
@Injectable()
export class QueueMetricsService {
  constructor(
    private readonly queue: QueueService,
    private readonly health: WorkerHealthRegistry,
  ) {}

  async getMetrics(): Promise<QueueMetricsResult> {
    const redisConnected = Boolean(this.queue.getRedisUrl());
    const workers = this.health.list();
    const workerQueues = new Set(workers.filter((w) => w.running).map((w) => w.queue));

    const queues: QueueMetric[] = [];
    for (const name of Object.values(QUEUE_NAMES)) {
      const q = this.queue.getQueue(name);
      const counts = q ? ((await q.getJobCounts()) as Record<string, number>) : null;
      queues.push({ queue: name, hasWorker: workerQueues.has(name), counts });
    }
    return { redisConnected, workers, queues };
  }
}
