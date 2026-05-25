import { Module } from '@nestjs/common';
import { PartnerKeysModule } from '../partner-keys/partner-keys.module';
import { ScamSignalsModule } from '../scam-signals/scam-signals.module';
import { PartnerReportsController } from './partner-reports.controller';

/**
 * Partner-facing surfaces (Phase 5B onward). Depends on PartnerKeysModule for
 * the ApiKeyGuard and on ScamSignalsModule for the shared intake engine.
 */
@Module({
  imports: [PartnerKeysModule, ScamSignalsModule],
  controllers: [PartnerReportsController],
})
export class PartnerIntelligenceModule {}
