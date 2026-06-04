import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence-vault/evidence.module';
import { IdentityCollisionController } from './identity-collision.controller';
import { IdentityCollisionService } from './identity-collision.service';
import { IdentityGraphController } from './identity-graph.controller';
import { IdentityGraphService } from './identity-graph.service';

@Module({
  imports: [EvidenceModule],
  controllers: [IdentityGraphController, IdentityCollisionController],
  providers: [IdentityGraphService, IdentityCollisionService],
  exports: [IdentityGraphService, IdentityCollisionService],
})
export class IdentityGraphModule {}
