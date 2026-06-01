import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';

/**
 * Global so any module can inject QueueService without importing this
 * module explicitly. Mirrors the CacheModule pattern (Phase 8A).
 */
@Global()
@Module({
  providers: [QueueService],
  exports: [QueueService],
})
export class QueueModule {}
