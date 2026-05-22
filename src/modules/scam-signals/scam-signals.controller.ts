import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { Roles } from '../../common/auth/roles.decorator';
import { ScamSignalsService } from './scam-signals.service';

/**
 * Internal signal review surface. Raw signals are private intelligence — only
 * reviewers / admins may read them (PDF §37 — the public cannot access these).
 */
@ApiTags('Scam Signals (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.REVIEWER, MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
@Controller({ path: 'intelligence/signals', version: '1' })
export class ScamSignalsController {
  constructor(private readonly scamSignals: ScamSignalsService) {}

  @Get()
  @ApiOperation({ summary: 'List scam signals (optionally filter by ?status=)' })
  list(@Query('status') status?: string) {
    return this.scamSignals.listSignals(status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a scam signal with its evidence' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.scamSignals.getSignal(id);
  }
}
