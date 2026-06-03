import { Module } from '@nestjs/common';
import { AiFeedbackService } from './ai-feedback.service';
import { ModelGovernanceController } from './model-governance.controller';
import { ModelRegistryService } from './model-registry.service';

/**
 * CP-7 — AI governance: model version registry + reviewer feedback loop.
 * Exports the services so AIDecision creators can stamp the active model id and
 * the feedback substrate can be reused by training tooling.
 */
@Module({
  controllers: [ModelGovernanceController],
  providers: [ModelRegistryService, AiFeedbackService],
  exports: [ModelRegistryService, AiFeedbackService],
})
export class ModelGovernanceModule {}
