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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { CreateRiskEventDto } from './dto/create-risk-event.dto';
import { RiskService } from './risk.service';

@ApiTags('Risk')
@ApiBearerAuth()
@Controller({ path: 'risk-events', version: '1' })
export class RiskController {
  constructor(private readonly risk: RiskService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit and score a risk event' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRiskEventDto,
    @Req() req: Request,
  ) {
    return this.risk.createRiskEvent(user, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get()
  @ApiOperation({ summary: 'List my risk events' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.risk.list(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a risk event' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.risk.getById(user, id);
  }
}
