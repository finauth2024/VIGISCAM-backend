import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { RecordInputDto } from './dto/record-input.dto';
import { StartSessionDto } from './dto/start-session.dto';
import { ScamMirrorService } from './scammirror.service';

@ApiTags('ScamMirror')
@ApiBearerAuth()
@Controller({ path: 'scammirror', version: '1' })
export class ScamMirrorController {
  constructor(private readonly service: ScamMirrorService) {}

  @Post('start')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Open a safe simulation session. Returns the session id and persona.',
  })
  start(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartSessionDto) {
    return this.service.start(user, dto);
  }

  @Post(':id/input')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Record a conversation turn. Sanitizer rejects real credentials and aborts the session.',
  })
  input(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordInputDto,
  ) {
    return this.service.recordInput(user, id, dto);
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'End the session. ?learned=true marks ENDED_LEARNED (feeds ScamScript Genome).',
  })
  @ApiQuery({ name: 'learned', required: false, type: Boolean })
  end(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('learned', new DefaultValuePipe(true), ParseBoolPipe) learned: boolean,
  ) {
    return this.service.end(user, id, learned);
  }

  @Get('history')
  @ApiOperation({ summary: 'Recent ScamMirror sessions for the authenticated user.' })
  @ApiQuery({ name: 'limit', required: false })
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.service.history(user, limit);
  }
}
