import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence-vault/evidence.module';
import { GuardianPauseModule } from '../guardian-pause/guardian-pause.module';
import { ClaimVerifyController } from './claimverify.controller';
import { ClaimVerifyService } from './claimverify.service';

@Module({
  imports: [EvidenceModule, GuardianPauseModule],
  controllers: [ClaimVerifyController],
  providers: [ClaimVerifyService],
  exports: [ClaimVerifyService],
})
export class ClaimVerifyModule {}
