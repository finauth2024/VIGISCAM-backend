import { Module } from '@nestjs/common';
import { RiskEventRecorderService } from './risk-event-recorder.service';

/**
 * CP-3 — shared RiskEvent recorder. Exported so every protection module can
 * emit a unified RiskEvent on each check/scan.
 */
@Module({
  providers: [RiskEventRecorderService],
  exports: [RiskEventRecorderService],
})
export class RiskEventsModule {}
