import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence-vault/evidence.module';
import { GuardianPauseModule } from '../guardian-pause/guardian-pause.module';
import { TrustedContactReviewModule } from '../trusted-contact-review/trusted-contact-review.module';
import { ProtectionSettingsModule } from '../protection-settings/protection-settings.module';
import { RiskEventsModule } from '../risk-events/risk-events.module';
import { ClaimVerifyController } from './claimverify.controller';
import { ClaimVerifyService } from './claimverify.service';

@Module({
  imports: [EvidenceModule, GuardianPauseModule, TrustedContactReviewModule, ProtectionSettingsModule, RiskEventsModule],
  controllers: [ClaimVerifyController],
  providers: [ClaimVerifyService],
  exports: [ClaimVerifyService],
})
export class ClaimVerifyModule {}
