import { Module } from '@nestjs/common';
import { AiDecisionsController } from './ai-decisions.controller';
import { NlpClassifierService } from './nlp-classifier.service';
import { NlpClient } from './nlp.client';

/**
 * AI integration foundation (Phase 6A). Exposes NlpClassifierService for
 * domain modules to call; every call is audited via the AIDecision table.
 */
@Module({
  controllers: [AiDecisionsController],
  providers: [NlpClient, NlpClassifierService],
  exports: [NlpClassifierService],
})
export class AiModule {}
