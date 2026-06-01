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
import { CompletePauseDto } from './dto/complete-pause.dto';
import { StartPauseDto } from './dto/start-pause.dto';
import { GuardianPauseService } from './guardian-pause.service';

/**
 * Guardian Pause™ (Phase 9A). Authenticated user-only endpoints.
 *
 * The flow is two RPCs from the client + a WebSocket subscription on
 * the user-scoped room: start opens the pause, complete records the
 * resolution. History is for the in-app "your protections" surface.
 */
@ApiTags('Guardian Pause')
@ApiBearerAuth()
@Controller({ path: 'guardian-pause', version: '1' })
export class GuardianPauseController {
  constructor(private readonly service: GuardianPauseService) {}

  @Post('start')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Open a Guardian Pause for the authenticated user. Returns the pause id + countdown deadline.',
  })
  start(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartPauseDto) {
    return this.service.start(user, dto);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Resolve an active pause (RESOLVED / CONTINUED_ANYWAY / EXPIRED). Idempotent error on already-resolved.',
  })
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompletePauseDto,
  ) {
    return this.service.complete(user, id, dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Recent pause history for the authenticated user.' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max rows (1-200, default 50).',
  })
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.service.history(user, limit);
  }
}
