import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MembershipRole } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { InternalTenantGuard } from '../../common/auth/internal-tenant.guard';
import { Public } from '../../common/auth/public.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import { StripeService } from '../../common/billing/stripe.service';
import { BillingService } from './billing.service';
import { SetManualInvoiceDto } from './dto/set-manual-invoice.dto';
import { StartCheckoutDto } from './dto/start-checkout.dto';

@ApiTags('Billing')
@Controller({ path: 'billing', version: '1' })
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly stripe: StripeService,
  ) {}

  @Get('subscription')
  @ApiBearerAuth()
  @ApiOperation({ summary: "My tenant's current subscription state" })
  subscription(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.getSubscription(user.tenantId);
  }

  @Post('checkout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start a Stripe Checkout session to upgrade plan' })
  checkout(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartCheckoutDto) {
    return this.billing.startCheckout(user, dto);
  }

  @Post('portal')
  @ApiBearerAuth()
  @HttpCode(200)
  @ApiOperation({ summary: 'Open the Stripe Billing Portal to manage payment method' })
  portal(@CurrentUser() user: AuthenticatedUser) {
    return this.billing.openPortal(user);
  }

  @Post('manual-invoice/:tenantId')
  @ApiBearerAuth()
  @UseGuards(InternalTenantGuard)
  @Roles(MembershipRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Set enterprise manual-invoice billing for a tenant (SUPER_ADMIN)' })
  manualInvoice(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Body() dto: SetManualInvoiceDto,
  ) {
    return this.billing.setManualInvoice(user, tenantId, dto);
  }

  /**
   * Stripe webhook receiver. Public + signature-verified (the signature
   * replaces JWT auth). Requires the raw request body, enabled via
   * `rawBody: true` in main.ts bootstrap.
   */
  @Post('webhook')
  @Public()
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    const raw = req.rawBody;
    if (!raw) {
      throw new BadRequestException('Missing raw request body for webhook verification');
    }
    let event;
    try {
      event = this.stripe.constructWebhookEvent(raw, signature);
    } catch (err) {
      throw new BadRequestException(`Webhook signature verification failed: ${String(err)}`);
    }
    return this.billing.handleWebhook(event);
  }
}
