import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { PlatformTenantGuard } from '../../common/auth/platform-tenant.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { GroomingCheckDto } from './dto/grooming-check.dto';
import { ModerationDecisionDto } from './dto/moderation-decision.dto';
import { ModerationQueueQueryDto } from './dto/moderation-queue-query.dto';
import { PlatformPortalService } from './platform-portal.service';

@ApiTags('PlatformShield Portal')
@ApiBearerAuth()
@UseGuards(PlatformTenantGuard)
@Roles(MembershipRole.PLATFORM_ADMIN, MembershipRole.PLATFORM_MODERATOR)
@Controller({ path: 'platform-portal', version: '1' })
export class PlatformPortalController {
  constructor(private readonly platformPortal: PlatformPortalService) {}

  @Get('moderation-queue')
  @ApiOperation({
    summary: 'Flagged claim verifications + grooming checks at MEDIUM+ for this platform',
  })
  queue(@CurrentUser() user: AuthenticatedUser, @Query() query: ModerationQueueQueryDto) {
    return this.platformPortal.getModerationQueue(user, query);
  }

  @Post('grooming-check')
  @ApiOperation({
    summary:
      'Score an interaction for grooming signals (flag inputs only; no message content stored)',
  })
  groomingCheck(@CurrentUser() user: AuthenticatedUser, @Body() dto: GroomingCheckDto) {
    return this.platformPortal.groomingCheck(user, dto);
  }

  @Post('moderation/:claimId/decision')
  @ApiOperation({ summary: 'Record a moderator decision on a flagged claim verification' })
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('claimId', new ParseUUIDPipe()) claimId: string,
    @Body() dto: ModerationDecisionDto,
  ) {
    return this.platformPortal.decideOnClaim(user, claimId, dto);
  }
}
