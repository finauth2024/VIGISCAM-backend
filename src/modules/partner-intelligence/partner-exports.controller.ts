import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { PartnerApiKeyScope } from '@prisma/client';
import { Request } from 'express';
import { ApiKeyGuard } from '../../common/auth/api-key.guard';
import { CurrentPartner } from '../../common/auth/current-partner.decorator';
import { PartnerPrincipal } from '../../common/auth/partner.types';
import { Public } from '../../common/auth/public.decorator';
import { RequireScopes } from '../../common/auth/require-scopes.decorator';
import { CreateExportRequestDto } from './dto/create-export-request.dto';
import { EvidenceExportService } from './evidence-export.service';

/**
 * Partner evidence-export bundles (PDF §39 "legal export controls", docs/04
 * §6). A bundle is a frozen snapshot of the tenant's Evidence Vault events
 * with a SHA-256 checksum for tamper detection. Authenticated via
 * X-API-Key + EVIDENCE_EXPORT scope.
 */
@ApiTags('Partner Intelligence')
@ApiSecurity('api-key')
@Public()
@UseGuards(ApiKeyGuard)
@RequireScopes(PartnerApiKeyScope.EVIDENCE_EXPORT)
@Controller({ path: 'partner/exports', version: '1' })
export class PartnerExportsController {
  constructor(private readonly exports: EvidenceExportService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate and persist a frozen evidence-export bundle' })
  generate(
    @CurrentPartner() partner: PartnerPrincipal,
    @Body() dto: CreateExportRequestDto,
    @Req() _req: Request,
  ) {
    return this.exports.generateBundle(partner, dto);
  }

  @Get()
  @ApiOperation({ summary: "List this tenant's past bundles (metadata only)" })
  list(@CurrentPartner('tenantId') tenantId: string) {
    return this.exports.listBundles(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Re-download a frozen bundle (404 if not owned or expired)' })
  get(@CurrentPartner('tenantId') tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.exports.getBundle(tenantId, id);
  }
}
