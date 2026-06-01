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
import { CheckWalletDto } from './dto/check-wallet.dto';
import { DecideWalletDto } from './dto/decide-wallet.dto';
import { WalletGuardService } from './walletguard.service';

@ApiTags('WalletGuard AI')
@ApiBearerAuth()
@Controller({ path: 'walletguard', version: '1' })
export class WalletGuardController {
  constructor(private readonly service: WalletGuardService) {}

  @Post('check')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Validate + score a wallet attempt. Opens a check; HIGH/CRITICAL pulls Guardian Pause.',
  })
  check(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckWalletDto) {
    return this.service.check(user, dto);
  }

  @Post(':id/decision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Record the terminal decision: VALIDATED / BLOCKED / ESCALATED_TO_TRUSTED_CONTACT / CONTINUED_ANYWAY.',
  })
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideWalletDto,
  ) {
    return this.service.decide(user, id, dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Recent wallet checks for the authenticated user.' })
  @ApiQuery({ name: 'limit', required: false })
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.service.history(user, limit);
  }
}
