import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence-vault/evidence.module';
import { GuardianPauseModule } from '../guardian-pause/guardian-pause.module';
import { GiftCardGuardController } from './giftcardguard.controller';
import { GiftCardGuardService } from './giftcardguard.service';

@Module({
  imports: [EvidenceModule, GuardianPauseModule],
  controllers: [GiftCardGuardController],
  providers: [GiftCardGuardService],
  exports: [GiftCardGuardService],
})
export class GiftCardGuardModule {}
