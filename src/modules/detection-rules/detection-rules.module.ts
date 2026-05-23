import { Module } from '@nestjs/common';
import { DetectionRuleController } from './detection-rule.controller';
import { DetectionRuleService } from './detection-rule.service';
import { RuleSuggestionController } from './rule-suggestion.controller';
import { RuleSuggestionService } from './rule-suggestion.service';

@Module({
  controllers: [DetectionRuleController, RuleSuggestionController],
  providers: [DetectionRuleService, RuleSuggestionService],
  exports: [DetectionRuleService, RuleSuggestionService],
})
export class DetectionRulesModule {}
