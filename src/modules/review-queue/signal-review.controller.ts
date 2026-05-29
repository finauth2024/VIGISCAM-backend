import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { ReviewSignalDto } from './dto/review-signal.dto';
import { ReviewQueueService } from './review-queue.service';

/** The signal review action (PDF §29.5) — reviewers / admins / compliance only. */
@ApiTags('Scam Signals (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.REVIEWER, MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
@Controller({ path: 'intelligence/signals', version: '1' })
export class SignalReviewController {
  constructor(private readonly reviewQueue: ReviewQueueService) {}

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record a review decision on a scam signal' })
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewSignalDto,
    @Req() req: Request,
  ) {
    return this.reviewQueue.reviewSignal(user, id, dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
