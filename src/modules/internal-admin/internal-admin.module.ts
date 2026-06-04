import { Module } from '@nestjs/common';
import { InternalTenantGuard } from '../../common/auth/internal-tenant.guard';
import { AdminConsoleController } from './admin-console.controller';
import { AdminConsoleService } from './admin-console.service';
import { InternalAdminController } from './internal-admin.controller';
import { InternalAdminService } from './internal-admin.service';
import { OversightController } from './oversight.controller';
import { OversightService } from './oversight.service';

@Module({
  controllers: [InternalAdminController, OversightController, AdminConsoleController],
  providers: [InternalAdminService, OversightService, AdminConsoleService, InternalTenantGuard],
  exports: [InternalAdminService, OversightService],
})
export class InternalAdminModule {}
