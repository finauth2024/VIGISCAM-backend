import { Module } from '@nestjs/common';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { ReviewQueueController } from './review-queue.controller';
import { ReviewQueueService } from './review-queue.service';
import { SignalReviewController } from './signal-review.controller';

@Module({
  imports: [WebhooksModule],
  controllers: [ReviewQueueController, SignalReviewController],
  providers: [ReviewQueueService],
  exports: [ReviewQueueService],
})
export class ReviewQueueModule {}
