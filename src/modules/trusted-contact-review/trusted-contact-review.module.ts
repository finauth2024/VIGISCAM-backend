import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence-vault/evidence.module';
// NotificationsModule is registered as @Global() in 8E so we get
// NotificationService injection automatically.
import { TrustedContactReviewController } from './trusted-contact-review.controller';
import { TrustedContactReviewService } from './trusted-contact-review.service';

@Module({
  imports: [EvidenceModule],
  controllers: [TrustedContactReviewController],
  providers: [TrustedContactReviewService],
  exports: [TrustedContactReviewService],
})
export class TrustedContactReviewModule {}
