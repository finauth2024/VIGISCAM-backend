import { Module } from '@nestjs/common';
import { InternalTenantGuard } from '../../common/auth/internal-tenant.guard';
import { InternalAdminController } from './internal-admin.controller';
import { InternalAdminService } from './internal-admin.service';
import { OversightController } from './oversight.controller';
import { OversightService } from './oversight.service';

@Module({
  controllers: [InternalAdminController, OversightController],
  providers: [InternalAdminService, OversightService, InternalTenantGuard],
  exports: [InternalAdminService, OversightService],
})
export class InternalAdminModule {}
