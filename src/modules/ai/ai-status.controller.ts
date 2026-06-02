import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { Roles } from '../../common/auth/roles.decorator';
import { AiStatusService } from './ai-status.service';

/**
 * AI worker toggle visibility (Phase 11B). Internal staff only — exposes
 * whether each AI engine is running on the external worker or the stub
 * fallback, plus a live tally from the decision audit trail.
 */
@ApiTags('AI Status (internal)')
@ApiBearerAuth()
@Roles(
  MembershipRole.REVIEWER,
  MembershipRole.SUPER_ADMIN,
  MembershipRole.COMPLIANCE_OFFICER,
  MembershipRole.SUPPORT,
)
@Controller({ path: 'intelligence/ai-status', version: '1' })
export class AiStatusController {
  constructor(private readonly status: AiStatusService) {}

  @Get()
  @ApiOperation({ summary: 'AI worker toggle status per engine (external vs stub)' })
  get() {
    return this.status.status();
  }

  @Get('usage')
  @ApiOperation({ summary: 'Recorded AI decisions grouped by engine + source' })
  usage() {
    return this.status.usage();
  }
}
