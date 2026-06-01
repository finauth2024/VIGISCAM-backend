import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence-vault/evidence.module';
import { GuardianPauseModule } from '../guardian-pause/guardian-pause.module';
import { WalletGuardController } from './walletguard.controller';
import { WalletGuardService } from './walletguard.service';

@Module({
  imports: [EvidenceModule, GuardianPauseModule],
  controllers: [WalletGuardController],
  providers: [WalletGuardService],
  exports: [WalletGuardService],
})
export class WalletGuardModule {}
