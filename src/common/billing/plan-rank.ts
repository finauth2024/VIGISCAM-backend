import { BillingPlan } from './billing-plans';

/** Tier order for plan comparisons. Higher number = more entitlements. */
export const PLAN_RANK: Record<BillingPlan, number> = {
  FREE: 0,
  BASIC: 1,
  FAMILY_GUARDIAN: 2,
  PREMIUM_SHIELD: 3,
};

/** True when `held` satisfies the `required` minimum tier. */
export function planSatisfies(held: BillingPlan, required: BillingPlan): boolean {
  return PLAN_RANK[held] >= PLAN_RANK[required];
}
