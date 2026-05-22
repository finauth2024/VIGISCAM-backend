import { Module } from '@nestjs/common';
import { RiskModule } from '../risk-fusion/risk.module';
import { FreezeGuardController } from './freezeguard.controller';
import { FreezeGuardService } from './freezeguard.service';

@Module({
  imports: [RiskModule],
  controllers: [FreezeGuardController],
  providers: [FreezeGuardService],
})
export class FreezeGuardModule {}
