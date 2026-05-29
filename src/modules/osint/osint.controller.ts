import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { Roles } from '../../common/auth/roles.decorator';
import { OsintService } from './osint.service';

/**
 * Internal OSINT enrichment views. Reviewer / admin / compliance only —
 * even public-source OSINT data is internal-only here so it cannot leak via
 * an un-reviewed surface.
 */
@ApiTags('OSINT Enrichments (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.REVIEWER, MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
@Controller({ path: 'intelligence/osint', version: '1' })
export class OsintController {
  constructor(private readonly osint: OsintService) {}

  @Get()
  @ApiOperation({ summary: 'List OSINT enrichments (optional filters)' })
  @ApiQuery({ name: 'signalId', required: false, format: 'uuid' })
  @ApiQuery({ name: 'indicatorType', required: false })
  @ApiQuery({ name: 'normalizedIndicator', required: false })
  @ApiQuery({ name: 'limit', required: false })
  list(
    @Query('signalId') signalId?: string,
    @Query('indicatorType') indicatorType?: string,
    @Query('normalizedIndicator') normalizedIndicator?: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number,
  ) {
    return this.osint.list({ signalId, indicatorType, normalizedIndicator }, limit);
  }
}
