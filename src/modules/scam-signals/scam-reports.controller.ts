import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { SubmitScamReportDto } from './dto/submit-scam-report.dto';
import { ScamSignalsService } from './scam-signals.service';

@ApiTags('Scam Reports')
@Controller({ path: 'scam-reports', version: '1' })
export class ScamReportsController {
  constructor(private readonly scamSignals: ScamSignalsService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Submit a scam report — stored privately, never auto-published',
  })
  submit(@Body() dto: SubmitScamReportDto, @Req() req: Request) {
    return this.scamSignals.submitReport(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
