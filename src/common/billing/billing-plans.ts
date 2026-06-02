/**
 * Billing plan registry (Phase 11A; renamed to the real product line).
 *
 * The consumer subscription plans are the VIGISCAM products: Basic, Family
 * Guardian, Premium Shield — plus FREE, the internal default/"no active
 * subscription" state. These are intentionally DECOUPLED from the
 * `PartnerApiKeyPlan` enum (FREE/PRO/ENTERPRISE), which governs partner-API
 * machine-to-machine quota and is a different concern.
 *
 * Plan codes are stored as strings on tenant_subscriptions.plan and validated
 * against this registry, so adding/renaming a product is a registry edit, not
 * an enum migration. Price ids live in env vars (per environment: test vs
 * live) — never in the DB.
 *
 * FREE has no price and is not purchasable; in production it is not offered as
 * a choice (the frontend hides it and checkout only accepts the paid plans),
 * but it remains the fallback state for any tenant without a paid subscription.
 */
export const BILLING_PLANS = ['FREE', 'BASIC', 'FAMILY_GUARDIAN', 'PREMIUM_SHIELD'] as const;
export type BillingPlan = (typeof BILLING_PLANS)[number];

export function isBillingPlan(v: string): v is BillingPlan {
  return (BILLING_PLANS as readonly string[]).includes(v);
}

export interface PlanDefinition {
  plan: BillingPlan;
  displayName: string;
  /** Env var holding the Stripe price id, or null for the free tier. */
  priceEnvVar: string | null;
  /** Whether a Stripe checkout is required to hold this plan. */
  requiresCheckout: boolean;
}

export const PLAN_REGISTRY: Record<BillingPlan, PlanDefinition> = {
  FREE: {
    plan: 'FREE',
    displayName: 'Free',
    priceEnvVar: null,
    requiresCheckout: false,
  },
  BASIC: {
    plan: 'BASIC',
    displayName: 'Vigiscam Basic',
    priceEnvVar: 'STRIPE_PRICE_BASIC',
    requiresCheckout: true,
  },
  FAMILY_GUARDIAN: {
    plan: 'FAMILY_GUARDIAN',
    displayName: 'Vigiscam Family Guardian',
    priceEnvVar: 'STRIPE_PRICE_FAMILY_GUARDIAN',
    requiresCheckout: true,
  },
  PREMIUM_SHIELD: {
    plan: 'PREMIUM_SHIELD',
    displayName: 'Vigiscam Premium Shield',
    priceEnvVar: 'STRIPE_PRICE_PREMIUM_SHIELD',
    requiresCheckout: true,
  },
};

/** The plans a tenant can purchase via checkout (FREE is not purchasable). */
export const PURCHASABLE_PLANS: BillingPlan[] = ['BASIC', 'FAMILY_GUARDIAN', 'PREMIUM_SHIELD'];

/** Status values a tenant_subscriptions row can hold. */
export const SUBSCRIPTION_STATUSES = [
  'INACTIVE',
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'CANCELED',
  'MANUAL',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** A subscription confers plan features only when it is in one of these states. */
export const ENTITLED_STATUSES: SubscriptionStatus[] = ['TRIALING', 'ACTIVE', 'MANUAL'];

/** Map a Stripe subscription.status to our internal status vocabulary. */
export function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus) {
    case 'trialing':
      return 'TRIALING';
    case 'active':
      return 'ACTIVE';
    case 'past_due':
    case 'unpaid':
      return 'PAST_DUE';
    case 'canceled':
    case 'incomplete_expired':
      return 'CANCELED';
    default:
      return 'INACTIVE';
  }
}
