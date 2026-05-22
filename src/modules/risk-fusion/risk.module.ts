import { Module } from '@nestjs/common';
import { FreezeLockModule } from '../freezelock/freezelock.module';
import { RiskController } from './risk.controller';
import { RiskService } from './risk.service';

@Module({
  imports: [FreezeLockModule],
  controllers: [RiskController],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
