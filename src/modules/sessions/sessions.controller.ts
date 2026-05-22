import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { SessionEventDto } from './dto/session-event.dto';
import { StartSessionDto } from './dto/start-session.dto';
import { SessionsService } from './sessions.service';

@ApiTags('Sessions')
@ApiBearerAuth()
@Controller({ path: 'sessions', version: '1' })
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post()
  @ApiOperation({ summary: 'Start a monitored session' })
  start(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartSessionDto) {
    return this.sessions.start(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my recent sessions' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.sessions.listForUser(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a session with its events' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.getById(user, id);
  }

  @Post(':id/events')
  @ApiOperation({ summary: 'Record a session event (evidence marker)' })
  recordEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SessionEventDto,
  ) {
    return this.sessions.recordEvent(user, id, dto);
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End a session' })
  end(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.end(user, id);
  }
}
