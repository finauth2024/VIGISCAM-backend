import { Module } from '@nestjs/common';
import { TakedownAutomationService } from './takedown-automation.service';
import { TakedownTemplateController } from './takedown-template.controller';
import { TakedownController } from './takedown.controller';
import { TakedownService } from './takedown.service';

@Module({
  controllers: [TakedownController, TakedownTemplateController],
  providers: [TakedownService, TakedownAutomationService],
  exports: [TakedownService, TakedownAutomationService],
})
export class TakedownModule {}
