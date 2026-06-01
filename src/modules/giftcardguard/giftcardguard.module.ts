import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence-vault/evidence.module';
import { GuardianPauseModule } from '../guardian-pause/guardian-pause.module';
import { TrustedContactReviewModule } from '../trusted-contact-review/trusted-contact-review.module';
import { GiftCardGuardController } from './giftcardguard.controller';
import { GiftCardGuardService } from './giftcardguard.service';

@Module({
  imports: [EvidenceModule, GuardianPauseModule, TrustedContactReviewModule],
  controllers: [GiftCardGuardController],
  providers: [GiftCardGuardService],
  exports: [GiftCardGuardService],
})
export class GiftCardGuardModule {}
