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
import { DecideRegistryAppealDto } from './dto/decide-registry-appeal.dto';
import { RegistryAppealService } from './registry-appeal.service';

/**
 * Internal handling of registry corrections & appeals (PDF §27). Reviewers
 * triage; the accept/reject decision is compliance/admin-only.
 */
@ApiTags('Registry Appeals (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.REVIEWER, MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
@Controller({ path: 'intelligence/registry-appeals', version: '1' })
export class RegistryAppealAdminController {
  constructor(private readonly appeals: RegistryAppealService) {}

  @Get()
  @ApiOperation({ summary: 'List registry appeals (optionally filter by ?status=)' })
  @ApiQuery({ name: 'status', required: false, description: 'RegistryAppealStatus filter' })
  list(@Query('status') status?: string) {
    return this.appeals.listAppeals(status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single appeal with its contested entry' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.appeals.getAppeal(id);
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take an appeal under review' })
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.appeals.startReview(user, id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post(':id/decide')
  @HttpCode(HttpStatus.OK)
  @Roles(MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
  @ApiOperation({ summary: 'Record the accept/reject decision on an appeal' })
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideRegistryAppealDto,
    @Req() req: Request,
  ) {
    return this.appeals.decideAppeal(user, id, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
