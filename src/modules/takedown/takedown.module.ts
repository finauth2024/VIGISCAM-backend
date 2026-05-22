import { Module } from '@nestjs/common';
import { TakedownController } from './takedown.controller';
import { TakedownService } from './takedown.service';

@Module({
  controllers: [TakedownController],
  providers: [TakedownService],
  exports: [TakedownService],
})
export class TakedownModule {}
