import { Module } from '@nestjs/common';
import { InternalAdminController } from './internal-admin.controller';
import { InternalAdminService } from './internal-admin.service';

@Module({
  controllers: [InternalAdminController],
  providers: [InternalAdminService],
  exports: [InternalAdminService],
})
export class InternalAdminModule {}
