import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthenticatedUser, RequestContext } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { RequestGuardianshipDto } from './dto/request-guardianship.dto';
import { GuardianshipService } from './guardianship.service';

function contextOf(req: Request): RequestContext {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}

@ApiTags('Guardianship')
@ApiBearerAuth()
@Controller({ path: 'guardianship', version: '1' })
export class GuardianshipController {
  constructor(private readonly guardianship: GuardianshipService) {}

  @Post('requests')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Request to protect another VIGISCAM account' })
  request(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestGuardianshipDto,
    @Req() req: Request,
  ) {
    return this.guardianship.requestGuardianship(user, dto, contextOf(req));
  }

  @Get('as-guardian')
  @ApiOperation({ summary: 'List people I am a guardian for' })
  asGuardian(@CurrentUser() user: AuthenticatedUser) {
    return this.guardianship.listAsGuardian(user);
  }

  @Get('as-protected')
  @ApiOperation({ summary: 'List guardianship requests / guardians of me' })
  asProtected(@CurrentUser() user: AuthenticatedUser) {
    return this.guardianship.listAsProtected(user);
  }

  @Post(':id/grant')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Grant monitoring consent (protected user)' })
  grant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.guardianship.grantConsent(user, id, contextOf(req));
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline a guardianship request (protected user)' })
  decline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.guardianship.declineConsent(user, id, contextOf(req));
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke monitoring consent (protected user)' })
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.guardianship.revokeConsent(user, id, contextOf(req));
  }

  @Get(':id/protected-summary')
  @ApiOperation({ summary: 'View a consented protected user (audit-logged)' })
  protectedSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ) {
    return this.guardianship.getProtectedSummary(user, id, contextOf(req));
  }
}
