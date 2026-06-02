import { PartnerApiKeyPlan } from '@prisma/client';

/** Tier order for plan comparisons. Higher number = more entitlements. */
export const PLAN_RANK: Record<PartnerApiKeyPlan, number> = {
  FREE: 0,
  PRO: 1,
  ENTERPRISE: 2,
};

/** True when `held` satisfies the `required` minimum tier. */
export function planSatisfies(held: PartnerApiKeyPlan, required: PartnerApiKeyPlan): boolean {
  return PLAN_RANK[held] >= PLAN_RANK[required];
}
