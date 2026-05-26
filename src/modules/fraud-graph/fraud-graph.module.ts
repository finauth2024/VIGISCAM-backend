import { Module } from '@nestjs/common';
import { FraudGraphController } from './fraud-graph.controller';
import { FraudGraphService } from './fraud-graph.service';

@Module({
  controllers: [FraudGraphController],
  providers: [FraudGraphService],
  exports: [FraudGraphService],
})
export class FraudGraphModule {}
