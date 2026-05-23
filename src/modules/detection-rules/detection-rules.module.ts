import { Module } from '@nestjs/common';
import { DetectionRuleController } from './detection-rule.controller';
import { DetectionRuleService } from './detection-rule.service';

@Module({
  controllers: [DetectionRuleController],
  providers: [DetectionRuleService],
  exports: [DetectionRuleService],
})
export class DetectionRulesModule {}
