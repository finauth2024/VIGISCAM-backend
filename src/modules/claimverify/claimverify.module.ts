import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence-vault/evidence.module';
import { GuardianPauseModule } from '../guardian-pause/guardian-pause.module';
import { TrustedContactReviewModule } from '../trusted-contact-review/trusted-contact-review.module';
import { ClaimVerifyController } from './claimverify.controller';
import { ClaimVerifyService } from './claimverify.service';

@Module({
  imports: [EvidenceModule, GuardianPauseModule, TrustedContactReviewModule],
  controllers: [ClaimVerifyController],
  providers: [ClaimVerifyService],
  exports: [ClaimVerifyService],
})
export class ClaimVerifyModule {}
