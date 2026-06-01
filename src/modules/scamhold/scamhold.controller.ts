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
import { CheckScamHoldDto } from './dto/check-scamhold.dto';
import { DecideScamHoldDto } from './dto/decide-scamhold.dto';
import { ScamHoldService } from './scamhold.service';

@ApiTags('ScamHold AI')
@ApiBearerAuth()
@Controller({ path: 'scamhold', version: '1' })
export class ScamHoldController {
  constructor(private readonly service: ScamHoldService) {}

  @Post('check')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Score a proposed financial action. Opens a ScamHold event; CRITICAL risk pulls Guardian Pause.',
  })
  check(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckScamHoldDto) {
    return this.service.check(user, dto);
  }

  @Post(':id/decision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Record the terminal decision on a pending ScamHold (RELEASE_AFTER_VERIFICATION / BLOCK / SEND_TO_TRUSTED_CONTACT / SAVE_ONLY / CONTINUE_ANYWAY).',
  })
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideScamHoldDto,
  ) {
    return this.service.decide(user, id, dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Recent ScamHold history for the authenticated user.' })
  @ApiQuery({ name: 'limit', required: false })
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.service.history(user, limit);
  }
}
