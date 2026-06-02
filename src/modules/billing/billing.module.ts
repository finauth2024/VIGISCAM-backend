import { Global, Module } from '@nestjs/common';
import { InternalTenantGuard } from '../../common/auth/internal-tenant.guard';
import { StripeService } from '../../common/billing/stripe.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

/**
 * Global so the RequirePlanGuard (and the 10E enterprise billing
 * surface) can inject BillingService without re-importing this module.
 */
@Global()
@Module({
  controllers: [BillingController],
  providers: [BillingService, StripeService, InternalTenantGuard],
  exports: [BillingService, StripeService],
})
export class BillingModule {}
