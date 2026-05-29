import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { TelemetryDto } from './dto/telemetry.dto';
import { FreezeGuardService } from './freezeguard.service';

@ApiTags('FREEZEGUARD')
@ApiBearerAuth()
@Controller({ path: 'freezeguard', version: '1' })
export class FreezeGuardController {
  constructor(private readonly freezeGuard: FreezeGuardService) {}

  @Post('telemetry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ingest device/session technical telemetry' })
  ingest(@CurrentUser() user: AuthenticatedUser, @Body() dto: TelemetryDto, @Req() req: Request) {
    return this.freezeGuard.ingestTelemetry(user, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
