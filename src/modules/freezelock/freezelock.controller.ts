import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { TriggerFreezeLockDto } from './dto/trigger-freezelock.dto';
import { FreezeLockService } from './freezelock.service';

@ApiTags('FreezeLock')
@ApiBearerAuth()
@Controller({ path: 'freezelock', version: '1' })
export class FreezeLockController {
  constructor(private readonly freezeLock: FreezeLockService) {}

  @Post('trigger')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Trigger an emergency intervention' })
  trigger(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TriggerFreezeLockDto,
    @Req() req: Request,
  ) {
    return this.freezeLock.trigger(
      user,
      {
        trigger: dto.trigger,
        sessionId: dto.sessionId,
        riskEventId: dto.riskEventId,
        actions: dto.actions,
      },
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }

  @Get()
  @ApiOperation({ summary: 'List my intervention history' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.freezeLock.list(user);
  }
}
