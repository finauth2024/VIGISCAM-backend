import { Module } from '@nestjs/common';
import { IntelligenceMetricsController } from './intelligence-metrics.controller';
import { IntelligenceMetricsService } from './intelligence-metrics.service';

@Module({
  controllers: [IntelligenceMetricsController],
  providers: [IntelligenceMetricsService],
  exports: [IntelligenceMetricsService],
})
export class IntelligenceMetricsModule {}
