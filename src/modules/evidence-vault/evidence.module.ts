import { Global, Module } from '@nestjs/common';
import { EvidenceExportWorker } from './evidence-export.worker';
import { EvidenceFileService } from './evidence-file.service';
import { EvidenceController } from './evidence.controller';
import { EvidenceService } from './evidence.service';

/** Global so any module can record evidence by injecting EvidenceService. */
@Global()
@Module({
  controllers: [EvidenceController],
  providers: [EvidenceService, EvidenceFileService, EvidenceExportWorker],
  exports: [EvidenceService, EvidenceFileService],
})
export class EvidenceModule {}
