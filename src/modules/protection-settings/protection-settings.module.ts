import { Module } from '@nestjs/common';
import { ProtectionPolicyService } from './protection-policy.service';
import { ProtectionSettingsController } from './protection-settings.controller';
import { ProtectionSettingsService } from './protection-settings.service';

/**
 * CP-1 — Protection Settings + UserProfile + the protection-policy engine.
 * Exports the service + policy engine so the protection modules (Guardian
 * Pause, ScamHold, GiftCardGuard, WalletGuard, ClaimVerify) can enforce
 * Elder Mode + trusted-contact rules.
 */
@Module({
  controllers: [ProtectionSettingsController],
  providers: [ProtectionSettingsService, ProtectionPolicyService],
  exports: [ProtectionSettingsService, ProtectionPolicyService],
})
export class ProtectionSettingsModule {}
