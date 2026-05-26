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
import { MembershipRole } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { RequestFusionDto } from './dto/request-fusion.dto';
import { RiskFusionV2Service } from './risk-fusion-v2.service';

/**
 * Risk Fusion v2 control surface (PDF §45). Reviewer / admin / compliance
 * only — fused scores + the contributing AI insights are private
 * intelligence.
 */
@ApiTags('Risk Fusion v2 (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.REVIEWER, MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
@Controller({ path: 'intelligence/risk-fusion', version: '1' })
export class RiskFusionV2Controller {
  constructor(private readonly fusion: RiskFusionV2Service) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Run the full fusion pipeline (journey + victim-state + predicted-move + authenticity) against a session',
  })
  fuse(@CurrentUser() user: AuthenticatedUser, @Body() dto: RequestFusionDto) {
    const { sessionId, ...hints } = dto;
    return this.fusion.fuse(user, { sessionId, hints });
  }

  @Get('latest/:sessionId')
  @ApiOperation({ summary: 'Latest fused assessment for one session' })
  latest(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return this.fusion.getLatestForSession(sessionId);
  }

  @Get()
  @ApiOperation({ summary: 'List fused assessments (optionally ?sessionId=)' })
  @ApiQuery({ name: 'sessionId', required: false, format: 'uuid' })
  @ApiQuery({ name: 'limit', required: false })
  list(
    @Query('sessionId') sessionId?: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number,
  ) {
    return this.fusion.list(sessionId, limit);
  }
}
