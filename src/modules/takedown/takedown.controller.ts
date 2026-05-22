import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { CreateTakedownDto } from './dto/create-takedown.dto';
import { UpdateTakedownStatusDto } from './dto/update-takedown-status.dto';
import { TakedownService } from './takedown.service';

/**
 * Internal takedown coordination (PDF §27). Tracks the requests VIGISCAM
 * sends to external providers to remove scam infrastructure. Internal-only —
 * there is no public surface for takedowns.
 */
@ApiTags('Takedown Requests (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.REVIEWER, MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
@Controller({ path: 'intelligence/takedowns', version: '1' })
export class TakedownController {
  constructor(private readonly takedowns: TakedownService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Open a takedown request against a registry entry' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTakedownDto,
    @Req() req: Request,
  ) {
    return this.takedowns.createTakedown(user, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get()
  @ApiOperation({ summary: 'List takedown requests (optionally filter by ?status=)' })
  @ApiQuery({ name: 'status', required: false, description: 'TakedownStatus filter' })
  list(@Query('status') status?: string) {
    return this.takedowns.listTakedowns(status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single takedown request with its registry entry' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.takedowns.getTakedown(id);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Advance a takedown request to a new status' })
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTakedownStatusDto,
    @Req() req: Request,
  ) {
    return this.takedowns.updateStatus(user, id, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
