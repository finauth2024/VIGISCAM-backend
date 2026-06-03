import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence-vault/evidence.module';
import { GuardianPauseModule } from '../guardian-pause/guardian-pause.module';
import { ProtectionSettingsModule } from '../protection-settings/protection-settings.module';
import { RiskEventsModule } from '../risk-events/risk-events.module';
import { TrustedContactReviewModule } from '../trusted-contact-review/trusted-contact-review.module';
import { ScamHoldController } from './scamhold.controller';
import { ScamHoldService } from './scamhold.service';

@Module({
  imports: [
    EvidenceModule,
    GuardianPauseModule,
    TrustedContactReviewModule,
    ProtectionSettingsModule,
    RiskEventsModule,
  ],
  controllers: [ScamHoldController],
  providers: [ScamHoldService],
  exports: [ScamHoldService],
})
export class ScamHoldModule {}
