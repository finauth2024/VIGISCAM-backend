import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { InternalTenantGuard } from '../../common/auth/internal-tenant.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { ListTenantsQueryDto } from './dto/list-tenants-query.dto';
import { ModuleEventsQueryDto } from './dto/module-events-query.dto';
import { SetTenantStatusDto } from './dto/set-tenant-status.dto';
import { OversightService } from './oversight.service';

/**
 * Phase 10F — internal-staff cross-tenant oversight console.
 *
 * Read surfaces are open to all internal staff roles; the single
 * mutating route (tenant status) is SUPER_ADMIN-only via a tighter
 * @Roles on the handler.
 */
@ApiTags('Internal Admin')
@ApiBearerAuth()
@UseGuards(InternalTenantGuard)
@Roles(
  MembershipRole.SUPER_ADMIN,
  MembershipRole.REVIEWER,
  MembershipRole.COMPLIANCE_OFFICER,
  MembershipRole.SUPPORT,
)
@Controller({ path: 'admin/oversight', version: '1' })
export class OversightController {
  constructor(private readonly oversight: OversightService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Platform-wide counts across protection modules + role portals' })
  overview() {
    return this.oversight.platformOverview();
  }

  @Get('module-events')
  @ApiOperation({ summary: 'Recent events for a protection module (cross-tenant)' })
  moduleEvents(@Query() query: ModuleEventsQueryDto) {
    return this.oversight.moduleEvents(query);
  }

  @Get('tenants')
  @ApiOperation({ summary: 'List tenants (filter by type/status)' })
  listTenants(@Query() query: ListTenantsQueryDto) {
    return this.oversight.listTenants(query);
  }

  @Patch('tenants/:tenantId/status')
  @HttpCode(HttpStatus.OK)
  @Roles(MembershipRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Suspend / reactivate a tenant (SUPER_ADMIN only)' })
  setTenantStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() dto: SetTenantStatusDto,
    @Req() req: Request,
  ) {
    return this.oversight.setTenantStatus(user, tenantId, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
