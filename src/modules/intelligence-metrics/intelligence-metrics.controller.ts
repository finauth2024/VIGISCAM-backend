import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { Roles } from '../../common/auth/roles.decorator';
import { IntelligenceMetricsService } from './intelligence-metrics.service';

/**
 * Internal intelligence dashboard backend (PDF §29.4, §36). Live counts only;
 * never a public surface. Reviewer / admin / compliance only.
 */
@ApiTags('Intelligence Metrics (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.REVIEWER, MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
@Controller({ path: 'intelligence/metrics', version: '1' })
export class IntelligenceMetricsController {
  constructor(private readonly metrics: IntelligenceMetricsService) {}

  @Get()
  @ApiOperation({ summary: 'Live counts across signals, clusters, registry, rules, appeals and takedowns' })
  get() {
    return this.metrics.getMetrics();
  }
}
