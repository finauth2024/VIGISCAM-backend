import { SetMetadata } from '@nestjs/common';
import { BillingPlan } from './billing-plans';

export const REQUIRE_PLAN_KEY = 'require_plan';

/**
 * Gate a route behind a minimum plan tier (Phase 11A). Enforced by
 * RequirePlanGuard, which resolves the caller tenant's *effective* plan
 * (a subscription only counts while in an entitled status).
 *
 * Tier order: FREE < PRO < ENTERPRISE. A route marked @RequirePlan('PRO')
 * admits PRO and ENTERPRISE tenants.
 */
export const RequirePlan = (plan: BillingPlan) => SetMetadata(REQUIRE_PLAN_KEY, plan);
