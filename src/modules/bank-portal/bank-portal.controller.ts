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
import { BankTenantGuard } from '../../common/auth/bank-tenant.guard';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { BankPortalService } from './bank-portal.service';
import { BankQueueQueryDto } from './dto/queue-query.dto';
import { ReviewCaseDto } from './dto/review-case.dto';
import { TellerAssistDto } from './dto/teller-assist.dto';

@ApiTags('BankGuard Portal')
@ApiBearerAuth()
@UseGuards(BankTenantGuard)
@Roles(MembershipRole.BANK_ADMIN, MembershipRole.BANK_ANALYST)
@Controller({ path: 'bank-portal', version: '1' })
export class BankPortalController {
  constructor(private readonly bankPortal: BankPortalService) {}

  @Get('queue')
  @ApiOperation({
    summary: 'Live risk queue — ScamHold + WalletGuard events at MEDIUM+ for this bank',
  })
  queue(@CurrentUser() user: AuthenticatedUser, @Query() query: BankQueueQueryDto) {
    return this.bankPortal.getQueue(user, query);
  }

  @Post('teller-assist')
  @ApiOperation({
    summary: 'Score a transaction-in-progress from a teller counter',
  })
  tellerAssist(@CurrentUser() user: AuthenticatedUser, @Body() dto: TellerAssistDto) {
    return this.bankPortal.tellerAssist(user, dto);
  }

  @Post('cases/:scamHoldId/review')
  @ApiOperation({
    summary: "Record the bank's professional opinion on an escalated ScamHold case",
  })
  reviewCase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('scamHoldId', new ParseUUIDPipe()) scamHoldId: string,
    @Body() dto: ReviewCaseDto,
  ) {
    return this.bankPortal.reviewCase(user, scamHoldId, dto);
  }
}
