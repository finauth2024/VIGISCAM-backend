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
import { DecideGiftCardDto } from './dto/decide-giftcard.dto';
import { ScanGiftCardDto } from './dto/scan-giftcard.dto';
import { GiftCardGuardService } from './giftcardguard.service';

@ApiTags('GiftCardGuard')
@ApiBearerAuth()
@Controller({ path: 'giftcardguard', version: '1' })
export class GiftCardGuardController {
  constructor(private readonly service: GiftCardGuardService) {}

  @Post('scan')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Score a gift-card scam pattern. Opens a warning; HIGH/CRITICAL pulls Guardian Pause.',
  })
  scan(@CurrentUser() user: AuthenticatedUser, @Body() dto: ScanGiftCardDto) {
    return this.service.scan(user, dto);
  }

  @Post(':id/decision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Record the user response: AVOIDED, CONTINUED_ANYWAY, or ESCALATED_TO_TRUSTED_CONTACT.',
  })
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideGiftCardDto,
  ) {
    return this.service.decide(user, id, dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Recent gift-card warnings for the authenticated user.' })
  @ApiQuery({ name: 'limit', required: false })
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.service.history(user, limit);
  }
}
