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
import { AgencyFeedService } from './agency-feed.service';

/**
 * Partner-facing consumer endpoint for cross-border agency feeds (Phase 7C).
 * Authenticated via X-API-Key + AGENCY_FEED scope. Tenant-isolated — the
 * partner key's tenant MUST own the requested feed.
 */
@ApiTags('Agency Feeds (consumer)')
@ApiSecurity('api-key')
@Public()
@UseGuards(ApiKeyGuard)
@RequireScopes(PartnerApiKeyScope.AGENCY_FEED)
@Controller({ path: 'partner/feeds', version: '1' })
export class AgencyFeedConsumerController {
  constructor(private readonly feeds: AgencyFeedService) {}

  @Get(':feedId/items')
  @ApiOperation({
    summary:
      'Consume the feed — returns PUBLISHED registry entries matching the feed filters, since the optional cursor.',
  })
  @ApiQuery({
    name: 'since',
    required: false,
    description: 'ISO timestamp — return entries updated after this point.',
  })
  @ApiQuery({ name: 'limit', required: false, description: 'Max items (1-200, default 50).' })
  consume(
    @CurrentPartner() partner: PartnerPrincipal,
    @Param('feedId', ParseUUIDPipe) feedId: string,
    @Query('since') since?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.feeds.consumeFeed(partner, feedId, since, limit);
  }
}
