import { PartnerApiKeyPlan } from '@prisma/client';

/**
 * Plan registry (Phase 11A). Maps the shared plan tier enum to the
 * Stripe price id (resolved from env at runtime) plus display metadata.
 *
 * Price ids live in env vars (STRIPE_PRICE_PRO, STRIPE_PRICE_ENTERPRISE)
 * rather than the DB so the same code points at test vs live prices per
 * environment without a migration. FREE has no price — it is the
 * default, no-charge tier.
 */
export interface PlanDefinition {
  plan: PartnerApiKeyPlan;
  displayName: string;
  /** Env var holding the Stripe price id, or null for the free tier. */
  priceEnvVar: string | null;
  /** Whether a Stripe checkout is required to hold this plan. */
  requiresCheckout: boolean;
}

export const PLAN_REGISTRY: Record<PartnerApiKeyPlan, PlanDefinition> = {
  FREE: {
    plan: 'FREE',
    displayName: 'Free',
    priceEnvVar: null,
    requiresCheckout: false,
  },
  PRO: {
    plan: 'PRO',
    displayName: 'Pro',
    priceEnvVar: 'STRIPE_PRICE_PRO',
    requiresCheckout: true,
  },
  ENTERPRISE: {
    plan: 'ENTERPRISE',
    displayName: 'Enterprise',
    priceEnvVar: 'STRIPE_PRICE_ENTERPRISE',
    requiresCheckout: true,
  },
};

export const PURCHASABLE_PLANS: PartnerApiKeyPlan[] = ['PRO', 'ENTERPRISE'];

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
