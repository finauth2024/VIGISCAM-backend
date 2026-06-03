import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence-vault/evidence.module';
import { TrustedContactReviewModule } from '../trusted-contact-review/trusted-contact-review.module';
import { ProtectionEnforcementService } from './protection-enforcement.service';
import { ProtectionPolicyService } from './protection-policy.service';
import { ProtectionSettingsController } from './protection-settings.controller';
import { ProtectionSettingsService } from './protection-settings.service';

/**
 * CP-1/CP-2 — Protection Settings + UserProfile + the protection-policy engine
 * + the cross-module enforcement gate. Exports the services so the protection
 * modules (Guardian Pause, ScamHold, GiftCardGuard, WalletGuard, ClaimVerify)
 * can enforce Elder Mode + trusted-contact rules identically.
 */
@Module({
  imports: [EvidenceModule, TrustedContactReviewModule],
  controllers: [ProtectionSettingsController],
  providers: [
    ProtectionSettingsService,
    ProtectionPolicyService,
    ProtectionEnforcementService,
  ],
  exports: [
    ProtectionSettingsService,
    ProtectionPolicyService,
    ProtectionEnforcementService,
  ],
})
export class ProtectionSettingsModule {}
