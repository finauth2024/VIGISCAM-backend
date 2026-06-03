import { Body, Controller, DefaultValuePipe, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { AiFeedbackService } from './ai-feedback.service';
import { RegisterModelDto, SetModelStatusDto } from './dto/register-model.dto';
import { SubmitAiFeedbackDto } from './dto/submit-ai-feedback.dto';
import { ModelRegistryService } from './model-registry.service';

/**
 * CP-7 — internal AI governance: model version registry + reviewer feedback
 * loop. Reviewer / admin / compliance only.
 */
@ApiTags('AI Governance (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.REVIEWER, MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
@Controller({ path: 'intelligence', version: '1' })
export class ModelGovernanceController {
  constructor(
    private readonly registry: ModelRegistryService,
    private readonly feedback: AiFeedbackService,
  ) {}

  // ── Model registry ──────────────────────────────────────────────────────
  @Get('models')
  @ApiOperation({ summary: 'List registered AI models (optional ?serviceKind= / ?status=).' })
  @ApiQuery({ name: 'serviceKind', required: false })
  @ApiQuery({ name: 'status', required: false })
  listModels(@Query('serviceKind') serviceKind?: string, @Query('status') status?: string) {
    return this.registry.list(serviceKind, status);
  }

  @Post('models')
  @ApiOperation({ summary: 'Register (or upsert) an AI model version with eval metrics.' })
  registerModel(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegisterModelDto) {
    return this.registry.register(user, dto);
  }

  @Patch('models/:id/status')
  @ApiOperation({ summary: 'Set a model lifecycle status (ACTIVE retires the prior active version).' })
  setModelStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetModelStatusDto) {
    return this.registry.setStatus(id, dto.status);
  }

  // ── Reviewer feedback loop ──────────────────────────────────────────────
  @Get('ai-decisions/review-queue')
  @ApiOperation({ summary: 'AI decisions awaiting human review (flagged or low-confidence).' })
  @ApiQuery({ name: 'serviceKind', required: false })
  @ApiQuery({ name: 'limit', required: false })
  reviewQueue(
    @Query('serviceKind') serviceKind?: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number,
  ) {
    return this.feedback.listForReview(serviceKind, limit);
  }

  @Post('ai-decisions/:id/feedback')
  @ApiOperation({ summary: 'Record a reviewer verdict on an AI decision (active-learning signal).' })
  submitFeedback(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitAiFeedbackDto,
  ) {
    return this.feedback.submitFeedback(user, id, dto);
  }

  @Get('ai-decisions/feedback-stats')
  @ApiOperation({ summary: 'Per-model evaluation metrics rolled up from reviewer feedback.' })
  @ApiQuery({ name: 'serviceKind', required: false })
  feedbackStats(@Query('serviceKind') serviceKind?: string) {
    return this.feedback.feedbackStats(serviceKind);
  }
}
