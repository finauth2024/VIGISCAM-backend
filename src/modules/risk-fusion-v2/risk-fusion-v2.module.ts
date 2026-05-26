import { Module } from '@nestjs/common';
import { RiskFusionV2Controller } from './risk-fusion-v2.controller';
import { RiskFusionV2Service } from './risk-fusion-v2.service';

@Module({
  controllers: [RiskFusionV2Controller],
  providers: [RiskFusionV2Service],
  exports: [RiskFusionV2Service],
})
export class RiskFusionV2Module {}
