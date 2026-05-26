import { Module } from '@nestjs/common';
import { AiDecisionsController } from './ai-decisions.controller';
import { EmbeddingClient } from './embedding.client';
import { EmbeddingService } from './embedding.service';
import { NlpClassifierService } from './nlp-classifier.service';
import { NlpClient } from './nlp.client';
import { SimilarityController } from './similarity.controller';

/**
 * AI integration foundation (Phase 6A) + vector embeddings (Phase 6B).
 * Exposes NlpClassifierService and EmbeddingService for domain modules to
 * call; every call is audited via the AIDecision table.
 */
@Module({
  controllers: [AiDecisionsController, SimilarityController],
  providers: [NlpClient, NlpClassifierService, EmbeddingClient, EmbeddingService],
  exports: [NlpClassifierService, EmbeddingService],
})
export class AiModule {}
