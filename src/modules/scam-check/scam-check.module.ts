import { Module } from '@nestjs/common';
import { ScamSignalsModule } from '../scam-signals/scam-signals.module';
import { ScamCheckController } from './scam-check.controller';
import { ScamCheckService } from './scam-check.service';

@Module({
  imports: [ScamSignalsModule],
  controllers: [ScamCheckController],
  providers: [ScamCheckService],
})
export class ScamCheckModule {}
