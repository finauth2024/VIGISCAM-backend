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
import { AuthenticityService } from './authenticity.service';
import { RequestAuthenticityCheckDto } from './dto/request-authenticity-check.dto';

/**
 * Internal Authenticity Verification Suite control surface (PDF §51).
 * Reviewer / admin / compliance only — verdicts feed Risk Fusion in Phase 6E
 * but are themselves private intelligence, never a public surface.
 */
@ApiTags('Authenticity Verification (internal)')
@ApiBearerAuth()
@Roles(MembershipRole.REVIEWER, MembershipRole.SUPER_ADMIN, MembershipRole.COMPLIANCE_OFFICER)
@Controller({ path: 'intelligence/authenticity', version: '1' })
export class AuthenticityController {
  constructor(private readonly authenticity: AuthenticityService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Run an Authenticity Verification Suite check against a session' })
  run(@CurrentUser() user: AuthenticatedUser, @Body() dto: RequestAuthenticityCheckDto) {
    return this.authenticity.runCheck(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List authenticity verdicts (optionally ?sessionId= and ?checkType=)' })
  @ApiQuery({ name: 'sessionId', required: false, format: 'uuid' })
  @ApiQuery({ name: 'checkType', required: false })
  @ApiQuery({ name: 'limit', required: false })
  list(
    @Query('sessionId') sessionId?: string,
    @Query('checkType') checkType?: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit?: number,
  ) {
    return this.authenticity.list(sessionId, checkType, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single authenticity verdict' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.authenticity.get(id);
  }
}
