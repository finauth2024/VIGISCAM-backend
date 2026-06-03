import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { EvidenceExportPayload, QUEUE_NAMES } from '../../common/queue/queue-names';
import { QueueService } from '../../common/queue/queue.service';
import { WorkerHealthRegistry } from '../../common/queue/worker-health.registry';
import { EvidenceFileService } from './evidence-file.service';

const WORKER_NAME = 'evidence-export-worker';

/**
 * CP-11 — background evidence-export worker (reviewer #11/#12). Consumes the
 * evidence-export queue and builds + persists a checksummed EvidenceExportBundle
 * off the request path. Disabled gracefully when REDIS_URL is unset (the
 * requester then gets a synchronous bundle instead).
 */
@Injectable()
export class EvidenceExportWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EvidenceExportWorker.name);
  private worker?: Worker;

  constructor(
    private readonly queue: QueueService,
    private readonly health: WorkerHealthRegistry,
    private readonly files: EvidenceFileService,
  ) {}

  onModuleInit(): void {
    const url = this.queue.getRedisUrl();
    if (!url) {
      this.logger.warn('No REDIS_URL — evidence export worker disabled.');
      return;
    }
    this.worker = new Worker(
      QUEUE_NAMES.EvidenceExport,
      async (job) => {
        const { evidenceEventId, tenantId, requestedByUserId } = job.data as EvidenceExportPayload;
        await this.files.processBundle(evidenceEventId, tenantId, requestedByUserId);
      },
      { connection: { url } },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`evidence export job ${job?.id} failed: ${err?.message}`),
    );
    this.health.register(WORKER_NAME, QUEUE_NAMES.EvidenceExport);
    this.logger.log('Evidence export worker started.');
  }

  async onModuleDestroy(): Promise<void> {
    this.health.markStopped(WORKER_NAME);
    await this.worker?.close();
  }
}
