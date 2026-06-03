import { Module } from '@nestjs/common';
import { OsintClient } from './osint.client';
import { OsintController } from './osint.controller';
import { OsintService } from './osint.service';
import { OsintEnrichmentWorker } from './osint-enrichment.worker';
import { OsintProviderRegistry } from './providers/osint-provider.registry';

@Module({
  controllers: [OsintController],
  providers: [OsintClient, OsintService, OsintProviderRegistry, OsintEnrichmentWorker],
  exports: [OsintService],
})
export class OsintModule {}
