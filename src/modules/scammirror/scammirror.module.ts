import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence-vault/evidence.module';
import { FraudGraphModule } from '../fraud-graph/fraud-graph.module';
import { GuardianPauseModule } from '../guardian-pause/guardian-pause.module';
import { ScamMirrorController } from './scammirror.controller';
import { ScamMirrorService } from './scammirror.service';

@Module({
  imports: [EvidenceModule, GuardianPauseModule, FraudGraphModule],
  controllers: [ScamMirrorController],
  providers: [ScamMirrorService],
  exports: [ScamMirrorService],
})
export class ScamMirrorModule {}
