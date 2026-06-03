import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Worker } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OsintEnrichmentPayload, QUEUE_NAMES } from '../../common/queue/queue-names';
import { QueueService } from '../../common/queue/queue.service';
import { WorkerHealthRegistry } from '../../common/queue/worker-health.registry';
import { OsintService } from './osint.service';

const WORKER_NAME = 'osint-enrichment-worker';

/**
 * CP-10 — background OSINT enrichment worker (reviewer #11). Consumes the
 * osint-enrichment queue: reloads the scam signal and runs the safe OSINT
 * pipeline (structural checks + provider layer). Lets heavy enrichment run off
 * the request path. Disabled gracefully when REDIS_URL is unset.
 */
@Injectable()
export class OsintEnrichmentWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OsintEnrichmentWorker.name);
  private worker?: Worker;

  constructor(
    private readonly queue: QueueService,
    private readonly health: WorkerHealthRegistry,
    private readonly osint: OsintService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    const url = this.queue.getRedisUrl();
    if (!url) {
      this.logger.warn('No REDIS_URL — OSINT enrichment worker disabled.');
      return;
    }
    this.worker = new Worker(
      QUEUE_NAMES.OsintEnrichment,
      async (job) => {
        const { signalId } = job.data as OsintEnrichmentPayload;
        const signal = await this.prisma.scamSignal.findUnique({ where: { id: signalId } });
        if (signal) await this.osint.enrichSignal(signal);
      },
      { connection: { url } },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.warn(`osint enrichment job ${job?.id} failed: ${err?.message}`),
    );
    this.health.register(WORKER_NAME, QUEUE_NAMES.OsintEnrichment);
    this.logger.log('OSINT enrichment worker started.');
  }

  async onModuleDestroy(): Promise<void> {
    this.health.markStopped(WORKER_NAME);
    await this.worker?.close();
  }
}
