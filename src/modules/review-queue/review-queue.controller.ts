import {
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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { MembershipRole } from '@prisma/client';
import { ReviewQueueService } from './review-queue.service';

/** Internal review queue — reviewers, admins and compliance only (PDF §37). */
@ApiTags('Review Queue (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.REVIEWER, MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
@Controller({ path: 'intelligence/review-queue', version: '1' })
export class ReviewQueueController {
  constructor(private readonly reviewQueue: ReviewQueueService) {}

  @Get()
  @ApiOperation({ summary: 'List review-queue items (optionally filter by ?status=)' })
  list(@Query('status') status?: string) {
    return this.reviewQueue.list(status);
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Claim a review-queue item' })
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.reviewQueue.assign(user, id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
