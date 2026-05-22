import { Module } from '@nestjs/common';
import { ScamReportsController } from './scam-reports.controller';
import { ScamSignalsController } from './scam-signals.controller';
import { ScamSignalsService } from './scam-signals.service';

@Module({
  controllers: [ScamReportsController, ScamSignalsController],
  providers: [ScamSignalsService],
  exports: [ScamSignalsService],
})
export class ScamSignalsModule {}
