import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../common/auth/public.decorator';
import { ScamCheckDto } from './dto/scam-check.dto';
import { ScamCheckService } from './scam-check.service';

@ApiTags('Scam Check')
@Controller({ path: 'scam-check', version: '1' })
export class ScamCheckController {
  constructor(private readonly scamCheck: ScamCheckService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check an indicator for scam risk (public, no login)' })
  check(@Body() dto: ScamCheckDto, @Req() req: Request) {
    return this.scamCheck.check(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
