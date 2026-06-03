import { Global, Module } from '@nestjs/common';
import { QueueAdminController } from './queue-admin.controller';
import { QueueMetricsService } from './queue-metrics.service';
import { QueueService } from './queue.service';
import { WorkerHealthRegistry } from './worker-health.registry';

/**
 * Global so any module can inject QueueService / WorkerHealthRegistry without
 * importing this module explicitly. Mirrors the CacheModule pattern (Phase 8A).
 * CP-10 adds the worker-health registry + queue metrics admin surface.
 */
@Global()
@Module({
  controllers: [QueueAdminController],
  providers: [QueueService, WorkerHealthRegistry, QueueMetricsService],
  exports: [QueueService, WorkerHealthRegistry, QueueMetricsService],
})
export class QueueModule {}
