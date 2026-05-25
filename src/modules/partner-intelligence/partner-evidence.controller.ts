import {
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { PartnerApiKeyScope } from '@prisma/client';
import { ApiKeyGuard } from '../../common/auth/api-key.guard';
import { CurrentPartner } from '../../common/auth/current-partner.decorator';
import { Public } from '../../common/auth/public.decorator';
import { RequireScopes } from '../../common/auth/require-scopes.decorator';
import { PartnerIntelligenceService } from './partner-intelligence.service';

/**
 * Tenant-scoped Evidence Vault view for partners (PDF §35, §43). Returns
 * only the events recorded with this tenant's tenantId — internal reviewer
 * events (logged with tenantId=null) are never exposed.
 */
@ApiTags('Partner Intelligence')
@ApiSecurity('api-key')
@Public()
@UseGuards(ApiKeyGuard)
@RequireScopes(PartnerApiKeyScope.READ_TENANT_INTEL)
@Controller({ path: 'partner/evidence', version: '1' })
export class PartnerEvidenceController {
  constructor(private readonly partner: PartnerIntelligenceService) {}

  @Get()
  @ApiOperation({ summary: "List this partner tenant's Evidence Vault events" })
  @ApiQuery({ name: 'entityType', required: false, description: 'e.g. SCAM_SIGNAL' })
  @ApiQuery({ name: 'entityId', required: false, description: 'Filter to one entity' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max items (1-500, default 200)' })
  list(
    @CurrentPartner('tenantId') tenantId: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('limit', new DefaultValuePipe(200), ParseIntPipe) limit?: number,
  ) {
    return this.partner.listEvidence(tenantId, { entityType, entityId }, limit);
  }
}
