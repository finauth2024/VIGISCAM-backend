import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence-vault/evidence.module';
import { GuardianPauseController } from './guardian-pause.controller';
import { GuardianPauseService } from './guardian-pause.service';

@Module({
  imports: [EvidenceModule],
  controllers: [GuardianPauseController],
  providers: [GuardianPauseService],
  exports: [GuardianPauseService],
})
export class GuardianPauseModule {}
