import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { InternalTenantGuard } from '../../common/auth/internal-tenant.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { AdminConsoleService } from './admin-console.service';

/**
 * FE-6 — read surfaces backing the internal Admin console pages that previously
 * showed mock data (users, devices, live sessions, audit logs, billing revenue,
 * scam corpus, script genome, compliance, support, settings). Internal-staff
 * only, same guard/role posture as the oversight console.
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
@Controller({ path: 'admin', version: '1' })
export class AdminConsoleController {
  constructor(private readonly admin: AdminConsoleService) {}

  private toLimit(limit?: string): number | undefined {
    const n = limit ? Number(limit) : NaN;
    return Number.isFinite(n) ? n : undefined;
  }

  @Get('users')
  @ApiOperation({ summary: 'List platform accounts with their primary role' })
  @ApiQuery({ name: 'limit', required: false })
  users(@Query('limit') limit?: string) {
    return this.admin.listUsers(this.toLimit(limit));
  }

  @Get('devices')
  @ApiOperation({ summary: 'List registered devices across tenants' })
  @ApiQuery({ name: 'limit', required: false })
  devices(@Query('limit') limit?: string) {
    return this.admin.listDevices(this.toLimit(limit));
  }

  @Get('live-sessions')
  @ApiOperation({ summary: 'List sessions (active first, then most recent)' })
  @ApiQuery({ name: 'limit', required: false })
  liveSessions(@Query('limit') limit?: string) {
    return this.admin.listLiveSessions(this.toLimit(limit));
  }

  @Get('audit-logs')
  @ApiOperation({ summary: 'List recent platform audit-log entries' })
  @ApiQuery({ name: 'limit', required: false })
  auditLogs(@Query('limit') limit?: string) {
    return this.admin.listAuditLogs(this.toLimit(limit));
  }

  @Get('revenue')
  @ApiOperation({ summary: 'Subscription revenue rollup (MRR/ARR + plan distribution)' })
  revenue() {
    return this.admin.billingRevenue();
  }

  @Get('scam-corpus')
  @ApiOperation({ summary: 'Scam-category taxonomy + per-category registry counts' })
  scamCorpus() {
    return this.admin.scamCorpus();
  }

  @Get('script-genome')
  @ApiOperation({ summary: 'Script-pattern nodes mined from ScamMirror / signals' })
  @ApiQuery({ name: 'limit', required: false })
  scriptGenome(@Query('limit') limit?: string) {
    return this.admin.scriptGenome(this.toLimit(limit));
  }

  @Get('compliance')
  @ApiOperation({ summary: 'Compliance overview (DSARs, retention, legal holds)' })
  compliance() {
    return this.admin.compliance();
  }

  @Get('support')
  @ApiOperation({ summary: 'Support overview (tickets)' })
  support() {
    return this.admin.support();
  }

  @Get('settings')
  @ApiOperation({ summary: 'Platform operational settings/flags' })
  settings() {
    return this.admin.settings();
  }
}
