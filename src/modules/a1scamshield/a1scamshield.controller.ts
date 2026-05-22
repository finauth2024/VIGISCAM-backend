import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { A1ScamShieldService } from './a1scamshield.service';
import { AnalyzeTextDto } from './dto/analyze-text.dto';

@ApiTags('A1SCAMSHIELD')
@ApiBearerAuth()
@Controller({ path: 'a1scamshield', version: '1' })
export class A1ScamShieldController {
  constructor(private readonly a1scamshield: A1ScamShieldService) {}

  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Analyse text for live scam language' })
  analyze(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AnalyzeTextDto,
    @Req() req: Request,
  ) {
    return this.a1scamshield.analyze(user, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
