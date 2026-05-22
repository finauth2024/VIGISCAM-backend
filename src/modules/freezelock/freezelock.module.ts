import { Module } from '@nestjs/common';
import { FreezeLockController } from './freezelock.controller';
import { FreezeLockService } from './freezelock.service';

@Module({
  controllers: [FreezeLockController],
  providers: [FreezeLockService],
  exports: [FreezeLockService],
})
export class FreezeLockModule {}
