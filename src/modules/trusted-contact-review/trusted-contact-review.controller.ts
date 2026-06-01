import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Public } from '../../common/auth/public.decorator';
import { DecideReviewDto } from './dto/decide-review.dto';
import { RequestReviewDto } from './dto/request-review.dto';
import { TrustedContactReviewService } from './trusted-contact-review.service';

/**
 * Phase 9H. Sits alongside the existing TrustedContactsController in
 * the families module — both share the `/trusted-contacts` prefix
 * because review-request is conceptually still a trusted-contact
 * action; the underlying controllers stay decoupled.
 */
@ApiTags('Trusted Contact Review')
@Controller({ path: 'trusted-contacts', version: '1' })
export class TrustedContactReviewController {
  constructor(private readonly service: TrustedContactReviewService) {}

  @Post('review-request')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Ask a trusted contact to weigh in on a high-risk event. Most calls come from 9B/9C/9D/9E services internally.',
  })
  request(@CurrentUser() user: AuthenticatedUser, @Body() dto: RequestReviewDto) {
    return this.service.requestReview({
      user,
      contactId: dto.contactId,
      triggerModule: dto.triggerModule,
      triggerEventId: dto.triggerEventId,
      triggerSummary: dto.triggerSummary,
      metadata: dto.metadata,
    });
  }

  /**
   * Trusted contact records their decision. Public because the contact
   * may not have a VIGISCAM account — they authenticate via the
   * one-time token mailed in the original notification. A logged-in
   * user (the protected user themselves, or an internal admin) can
   * also record the decision and bypasses the token check.
   */
  @Public()
  @Post('review/:id/decision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Record the trusted contact decision. Accepts either a logged-in caller or the one-time token.',
  })
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideReviewDto,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.service.decide(id, {
      decision: dto.decision,
      notes: dto.notes,
      decidedByContactToken: dto.decidedByContactToken,
      caller: user,
    });
  }

  @Get('reviews')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'My open + closed trusted-contact reviews.' })
  @ApiQuery({ name: 'limit', required: false })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.service.list(user, limit);
  }
}
