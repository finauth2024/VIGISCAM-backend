import { Module } from '@nestjs/common';
import { AiDecisionsController } from './ai-decisions.controller';
import { AiStatusController } from './ai-status.controller';
import { AiStatusService } from './ai-status.service';
import { EmbeddingClient } from './embedding.client';
import { EmbeddingService } from './embedding.service';
import { NlpClassifierService } from './nlp-classifier.service';
import { NlpClient } from './nlp.client';
import { SimilarityController } from './similarity.controller';

/**
 * AI integration foundation (Phase 6A) + vector embeddings (Phase 6B) +
 * worker-toggle status (Phase 11B). Exposes NlpClassifierService and
 * EmbeddingService for domain modules to call; every call is audited via
 * the AIDecision table.
 */
@Module({
  controllers: [AiDecisionsController, SimilarityController, AiStatusController],
  providers: [NlpClient, NlpClassifierService, EmbeddingClient, EmbeddingService, AiStatusService],
  exports: [NlpClassifierService, EmbeddingService],
})
export class AiModule {}
