import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence-vault/evidence.module';
import { IdentityGraphController } from './identity-graph.controller';
import { IdentityGraphService } from './identity-graph.service';

@Module({
  imports: [EvidenceModule],
  controllers: [IdentityGraphController],
  providers: [IdentityGraphService],
  exports: [IdentityGraphService],
})
export class IdentityGraphModule {}
