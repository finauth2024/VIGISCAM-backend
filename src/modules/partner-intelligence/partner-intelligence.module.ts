import { Module } from '@nestjs/common';
import { PartnerKeysModule } from '../partner-keys/partner-keys.module';
import { ScamSignalsModule } from '../scam-signals/scam-signals.module';
import { EvidenceExportService } from './evidence-export.service';
import { PartnerEvidenceController } from './partner-evidence.controller';
import { PartnerExportsController } from './partner-exports.controller';
import { PartnerIntelligenceService } from './partner-intelligence.service';
import { PartnerReportsController } from './partner-reports.controller';
import { PartnerSignalsController } from './partner-signals.controller';

/**
 * Partner-facing surfaces (Phase 5B onward). Depends on PartnerKeysModule for
 * the ApiKeyGuard and on ScamSignalsModule for the shared intake engine.
 */
@Module({
  imports: [PartnerKeysModule, ScamSignalsModule],
  controllers: [
    PartnerReportsController,
    PartnerSignalsController,
    PartnerEvidenceController,
    PartnerExportsController,
  ],
  providers: [PartnerIntelligenceService, EvidenceExportService],
  exports: [PartnerIntelligenceService, EvidenceExportService],
})
export class PartnerIntelligenceModule {}
