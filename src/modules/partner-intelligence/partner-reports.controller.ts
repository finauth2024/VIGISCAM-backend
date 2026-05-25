import { Body, Controller, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { PartnerApiKeyScope } from '@prisma/client';
import { Request } from 'express';
import { ApiKeyGuard } from '../../common/auth/api-key.guard';
import { CurrentPartner } from '../../common/auth/current-partner.decorator';
import { PartnerPrincipal } from '../../common/auth/partner.types';
import { Public } from '../../common/auth/public.decorator';
import { RequireScopes } from '../../common/auth/require-scopes.decorator';
import { SubmitScamReportDto } from '../scam-signals/dto/submit-scam-report.dto';
import { ScamSignalsService } from '../scam-signals/scam-signals.service';

/**
 * Partner intake endpoint (PDF §43 "bank/partner report ingestion"). Banks,
 * platforms, agencies, investigators and enterprises submit private scam
 * intelligence here, authenticated by an X-API-Key carrying the
 * `REPORT_SUBMIT` scope. The signal is tagged with the partner tenant and
 * the right SignalSourceType (which carries a higher base reliability than
 * a public user report).
 */
@ApiTags('Partner Intake')
@ApiSecurity('api-key')
@Public()
@UseGuards(ApiKeyGuard)
@RequireScopes(PartnerApiKeyScope.REPORT_SUBMIT)
@Controller({ path: 'partner/reports', version: '1' })
export class PartnerReportsController {
  constructor(private readonly signals: ScamSignalsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a private scam report from an authenticated partner tenant' })
  submit(
    @CurrentPartner() partner: PartnerPrincipal,
    @Body() dto: SubmitScamReportDto,
    @Req() req: Request,
  ) {
    return this.signals.submitPartnerReport(partner, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
