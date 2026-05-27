import {
  Body,
  Controller,
  Delete,
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
import { AgencyFeedService } from './agency-feed.service';
import { CreateAgencyFeedDto } from './dto/create-agency-feed.dto';

/**
 * Internal management of cross-border agency feeds (PDF §43, docs/04 LR-4).
 * SUPER_ADMIN only — issuing a feed is the operational counterpart to a
 * signed cross-border data-sharing agreement.
 */
@ApiTags('Agency Feeds (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.SUPER_ADMIN)
@Controller({ path: 'admin/agency-feeds', version: '1' })
export class AgencyFeedAdminController {
  constructor(private readonly feeds: AgencyFeedService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Issue a new agency feed for an AGENCY-eligible tenant' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAgencyFeedDto,
    @Req() req: Request,
  ) {
    return this.feeds.createFeed(user, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get()
  @ApiOperation({ summary: 'List agency feeds (optionally ?tenantId=)' })
  @ApiQuery({ name: 'tenantId', required: false, format: 'uuid' })
  list(@Query('tenantId') tenantId?: string) {
    return this.feeds.listFeeds(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one agency feed' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.feeds.getFeed(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke an agency feed' })
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.feeds.revokeFeed(user, id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
