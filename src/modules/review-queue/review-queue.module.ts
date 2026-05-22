import { Module } from '@nestjs/common';
import { ReviewQueueController } from './review-queue.controller';
import { ReviewQueueService } from './review-queue.service';
import { SignalReviewController } from './signal-review.controller';

@Module({
  controllers: [ReviewQueueController, SignalReviewController],
  providers: [ReviewQueueService],
  exports: [ReviewQueueService],
})
export class ReviewQueueModule {}
