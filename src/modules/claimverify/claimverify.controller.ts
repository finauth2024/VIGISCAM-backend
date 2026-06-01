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
import { DecideClaimDto } from './dto/decide-claim.dto';
import { VerifyClaimDto } from './dto/verify-claim.dto';
import { ClaimVerifyService } from './claimverify.service';

@ApiTags('ClaimVerify AI')
@ApiBearerAuth()
@Controller({ path: 'claimverify', version: '1' })
export class ClaimVerifyController {
  constructor(private readonly service: ClaimVerifyService) {}

  @Post('verify')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Score a claim against subject signals (domain age, location, image reuse, NLP) and verbal-pressure context. HIGH/CRITICAL pulls Guardian Pause.',
  })
  verify(@CurrentUser() user: AuthenticatedUser, @Body() dto: VerifyClaimDto) {
    return this.service.verify(user, dto);
  }

  @Post(':id/decision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Record the terminal decision: TRUSTED / REJECTED / ESCALATED_TO_TRUSTED_CONTACT / CONTINUED_ANYWAY.',
  })
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideClaimDto,
  ) {
    return this.service.decide(user, id, dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Recent claim verifications for the authenticated user.' })
  @ApiQuery({ name: 'limit', required: false })
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.service.history(user, limit);
  }
}
