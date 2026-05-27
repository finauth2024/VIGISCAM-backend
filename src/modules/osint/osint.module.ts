import { Module } from '@nestjs/common';
import { OsintClient } from './osint.client';
import { OsintController } from './osint.controller';
import { OsintService } from './osint.service';

@Module({
  controllers: [OsintController],
  providers: [OsintClient, OsintService],
  exports: [OsintService],
})
export class OsintModule {}
