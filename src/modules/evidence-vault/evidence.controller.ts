import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { EvidenceService } from './evidence.service';

@ApiTags('Evidence Vault')
@ApiBearerAuth()
@Controller({ path: 'evidence', version: '1' })
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Get('timeline')
  @ApiOperation({ summary: 'Hash-chained evidence timeline for my tenant' })
  timeline(
    @CurrentUser() user: AuthenticatedUser,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.evidence.getTimeline(user.tenantId, { entityType, entityId });
  }

  @Get('verify')
  @ApiOperation({ summary: 'Verify the integrity of my tenant evidence chain' })
  verify(@CurrentUser() user: AuthenticatedUser) {
    return this.evidence.verifyChain(user.tenantId);
  }
}
