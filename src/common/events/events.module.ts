import { Global, Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { EventsService } from './events.service';

/**
 * Global so any module can inject EventsService without re-importing.
 * Mirrors CacheModule and QueueModule (Phase 8A/8B).
 */
@Global()
@Module({
  providers: [EventsGateway, EventsService],
  exports: [EventsService],
})
export class EventsModule {}
