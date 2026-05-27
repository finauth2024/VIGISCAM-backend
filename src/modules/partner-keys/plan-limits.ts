import { PartnerApiKeyPlan } from '@prisma/client';

/** Daily request quota per plan. `null` = unlimited (ENTERPRISE). */
export type DailyLimit = number | null;

export const DAILY_LIMITS: Record<PartnerApiKeyPlan, DailyLimit> = {
  FREE: 1_000,
  PRO: 100_000,
  ENTERPRISE: null,
};

/** Returns the daily limit for a plan, or null for unlimited. */
export function dailyLimitFor(plan: PartnerApiKeyPlan): DailyLimit {
  return DAILY_LIMITS[plan];
}

/** UTC midnight today as a Date — the bucket the daily usage counter uses. */
export function todayUtcBucket(now: Date = new Date()): Date {
  return new Date(now.toISOString().slice(0, 10));
}
