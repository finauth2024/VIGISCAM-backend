import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { ClusteringModule } from '../clustering/clustering.module';
import { FraudGraphModule } from '../fraud-graph/fraud-graph.module';
import { ScamReportsController } from './scam-reports.controller';
import { ScamSignalsController } from './scam-signals.controller';
import { ScamSignalsService } from './scam-signals.service';

@Module({
  imports: [ClusteringModule, AiModule, FraudGraphModule],
  controllers: [ScamReportsController, ScamSignalsController],
  providers: [ScamSignalsService],
  exports: [ScamSignalsService],
})
export class ScamSignalsModule {}
