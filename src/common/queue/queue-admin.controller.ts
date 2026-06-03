import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { QueueMetricsService } from './queue-metrics.service';

/**
 * CP-10 — internal queue/worker observability. Super-admin / compliance only.
 */
@ApiTags('Queues (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
@Controller({ path: 'admin/queues', version: '1' })
export class QueueAdminController {
  constructor(private readonly metrics: QueueMetricsService) {}

  @Get()
  @ApiOperation({ summary: 'Queue + worker metrics: Redis status, registered workers, job counts.' })
  getMetrics() {
    return this.metrics.getMetrics();
  }
}
