import { Module } from '@nestjs/common';
import { RiskModule } from '../risk-fusion/risk.module';
import { A1ScamShieldController } from './a1scamshield.controller';
import { A1ScamShieldService } from './a1scamshield.service';

@Module({
  imports: [RiskModule],
  controllers: [A1ScamShieldController],
  providers: [A1ScamShieldService],
})
export class A1ScamShieldModule {}
