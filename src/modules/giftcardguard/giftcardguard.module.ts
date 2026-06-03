import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence-vault/evidence.module';
import { GuardianPauseModule } from '../guardian-pause/guardian-pause.module';
import { TrustedContactReviewModule } from '../trusted-contact-review/trusted-contact-review.module';
import { ProtectionSettingsModule } from '../protection-settings/protection-settings.module';
import { RiskEventsModule } from '../risk-events/risk-events.module';
import { GiftCardGuardController } from './giftcardguard.controller';
import { GiftCardGuardService } from './giftcardguard.service';

@Module({
  imports: [EvidenceModule, GuardianPauseModule, TrustedContactReviewModule, ProtectionSettingsModule, RiskEventsModule],
  controllers: [GiftCardGuardController],
  providers: [GiftCardGuardService],
  exports: [GiftCardGuardService],
})
export class GiftCardGuardModule {}
