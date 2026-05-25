import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { PartnerApiKeyScope } from '@prisma/client';
import { ApiKeyGuard } from '../../common/auth/api-key.guard';
import { CurrentPartner } from '../../common/auth/current-partner.decorator';
import { PartnerPrincipal } from '../../common/auth/partner.types';
import { Public } from '../../common/auth/public.decorator';
import { RequireScopes } from '../../common/auth/require-scopes.decorator';
import { PartnerIntelligenceService } from './partner-intelligence.service';

/**
 * Tenant-scoped signal views for partners (PDF §43). Every query is filtered
 * by the authenticated partner's tenantId — no path here can return another
 * tenant's signals.
 */
@ApiTags('Partner Intelligence')
@ApiSecurity('api-key')
@Public()
@UseGuards(ApiKeyGuard)
@RequireScopes(PartnerApiKeyScope.READ_TENANT_INTEL)
@Controller({ path: 'partner/signals', version: '1' })
export class PartnerSignalsController {
  constructor(private readonly partner: PartnerIntelligenceService) {}

  @Get()
  @ApiOperation({ summary: "List this partner tenant's submitted signals" })
  @ApiQuery({ name: 'status', required: false, description: 'ScamSignalStatus filter' })
  @ApiQuery({ name: 'limit', required: false, description: 'Max items (1-200, default 100)' })
  list(
    @CurrentPartner('tenantId') tenantId: string,
    @Query('status') status?: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number,
  ) {
    return this.partner.listSignals(tenantId, status, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: "Get one of this partner tenant's signals (404 if not owned)" })
  get(@CurrentPartner('tenantId') tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.partner.getSignal(tenantId, id);
  }
}
