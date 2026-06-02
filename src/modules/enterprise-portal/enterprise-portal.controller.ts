import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { EnterpriseTenantGuard } from '../../common/auth/enterprise-tenant.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { ListDevicesQueryDto } from './dto/list-devices-query.dto';
import { SetPolicyDto } from './dto/set-policy.dto';
import { EnterprisePortalService } from './enterprise-portal.service';

@ApiTags('Enterprise Admin')
@ApiBearerAuth()
@UseGuards(EnterpriseTenantGuard)
@Roles(MembershipRole.ENTERPRISE_ADMIN)
@Controller({ path: 'enterprise-portal', version: '1' })
export class EnterprisePortalController {
  constructor(private readonly enterprise: EnterprisePortalService) {}

  // ── Policies ──────────────────────────────────────────────────────────────

  @Get('policies/registry')
  @ApiOperation({ summary: 'List the closed registry of supported policy keys' })
  policyRegistry() {
    return this.enterprise.listPolicyDefinitions();
  }

  @Get('policies')
  @ApiOperation({ summary: 'List policies set on my tenant' })
  listPolicies(@CurrentUser() user: AuthenticatedUser) {
    return this.enterprise.listPolicies(user);
  }

  @Get('policies/:key')
  @ApiOperation({ summary: 'Get one policy by key' })
  getPolicy(@CurrentUser() user: AuthenticatedUser, @Param('key') key: string) {
    return this.enterprise.getPolicy(user, key);
  }

  @Put('policies/:key')
  @ApiOperation({ summary: 'Set or update a policy value' })
  setPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('key') key: string,
    @Body() dto: SetPolicyDto,
  ) {
    return this.enterprise.setPolicy(user, key, dto);
  }

  @Delete('policies/:key')
  @HttpCode(204)
  @ApiOperation({ summary: 'Clear a policy (reverts to tenant default)' })
  async deletePolicy(@CurrentUser() user: AuthenticatedUser, @Param('key') key: string) {
    await this.enterprise.deletePolicy(user, key);
  }

  // ── Devices ────────────────────────────────────────────────────────────────

  @Get('devices')
  @ApiOperation({ summary: 'Read-only device fleet for my tenant' })
  listDevices(@CurrentUser() user: AuthenticatedUser, @Query() query: ListDevicesQueryDto) {
    return this.enterprise.listDevices(user, query);
  }

  // ── Integrations ───────────────────────────────────────────────────────────

  @Get('integrations')
  @ApiOperation({ summary: 'List third-party integrations registered for my tenant' })
  listIntegrations(@CurrentUser() user: AuthenticatedUser) {
    return this.enterprise.listIntegrations(user);
  }

  @Post('integrations')
  @ApiOperation({ summary: 'Register a new integration' })
  createIntegration(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateIntegrationDto) {
    return this.enterprise.createIntegration(user, dto);
  }

  @Delete('integrations/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete an integration' })
  async deleteIntegration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.enterprise.deleteIntegration(user, id);
  }

  // ── Audit log + billing ────────────────────────────────────────────────────

  @Get('audit-log')
  @ApiOperation({ summary: 'Tenant-scoped evidence chain (read-only alias)' })
  auditLog(@CurrentUser() user: AuthenticatedUser, @Query() query: AuditLogQueryDto) {
    return this.enterprise.auditLog(user, query);
  }

  @Get('billing')
  @ApiOperation({ summary: 'Billing summary — live subscription state (Phase 11A)' })
  billing(@CurrentUser() user: AuthenticatedUser) {
    return this.enterprise.billingSummary(user);
  }
}
