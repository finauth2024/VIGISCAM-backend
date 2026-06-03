import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantSubscription } from '@prisma/client';
import type Stripe from 'stripe';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import {
  BillingPlan,
  ENTITLED_STATUSES,
  mapStripeStatus,
  PLAN_REGISTRY,
  PURCHASABLE_PLANS,
  SubscriptionStatus,
} from '../../common/billing/billing-plans';
import { StripeService } from '../../common/billing/stripe.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { SetManualInvoiceDto } from './dto/set-manual-invoice.dto';
import { StartCheckoutDto } from './dto/start-checkout.dto';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly evidence: EvidenceService,
    private readonly config: ConfigService,
  ) {}

  // ─── Reads ─────────────────────────────────────────────────────────────────

  /** Return the tenant's subscription row, or a synthetic FREE/INACTIVE default. */
  async getSubscription(tenantId: string): Promise<{
    tenantId: string;
    plan: BillingPlan;
    status: SubscriptionStatus;
    stripeCustomerId: string | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
    manualInvoice: boolean;
    stripeConfigured: boolean;
  }> {
    const row = await this.prisma.tenantSubscription.findUnique({ where: { tenantId } });
    return {
      tenantId,
      plan: (row?.plan as BillingPlan) ?? 'FREE',
      status: (row?.status as SubscriptionStatus) ?? 'INACTIVE',
      stripeCustomerId: row?.stripeCustomerId ?? null,
      currentPeriodEnd: row?.currentPeriodEnd ?? null,
      cancelAtPeriodEnd: row?.cancelAtPeriodEnd ?? false,
      manualInvoice: row?.manualInvoice ?? false,
      stripeConfigured: this.stripe.isConfigured(),
    };
  }

  /**
   * The effective plan a tenant is entitled to right now. A subscription
   * only confers its plan while in an entitled status; otherwise the
   * tenant falls back to FREE. Used by plan-enforcement.
   */
  async resolveEffectivePlan(tenantId: string): Promise<BillingPlan> {
    const row = await this.prisma.tenantSubscription.findUnique({ where: { tenantId } });
    if (!row) return 'FREE';
    if (!ENTITLED_STATUSES.includes(row.status as SubscriptionStatus)) return 'FREE';
    return row.plan as BillingPlan;
  }

  // ─── Checkout + portal ──────────────────────────────────────────────────────

  async startCheckout(user: AuthenticatedUser, dto: StartCheckoutDto) {
    this.assertBillingConfiguredInProduction();
    if (!PURCHASABLE_PLANS.includes(dto.plan)) {
      throw new BadRequestException('This plan is not purchasable');
    }
    const def = PLAN_REGISTRY[dto.plan];
    const priceId = def.priceEnvVar ? this.config.get<string>(def.priceEnvVar) : null;
    // In live mode a missing price id is a misconfiguration; in stub mode
    // we substitute a placeholder so the flow is still exercisable.
    if (this.stripe.isConfigured() && !priceId) {
      throw new BadRequestException(
        `No Stripe price configured for ${dto.plan} (set ${def.priceEnvVar})`,
      );
    }
    const effectivePriceId = priceId ?? `price_stub_${dto.plan}`;

    const existing = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId: user.tenantId },
    });
    const customerId = await this.stripe.ensureCustomer({
      tenantId: user.tenantId,
      email: user.email,
      existingCustomerId: existing?.stripeCustomerId,
    });

    const appBase = this.config.get<string>('APP_PUBLIC_URL', 'https://app.vigiscam.local');
    const session = await this.stripe.createCheckoutSession({
      customerId,
      priceId: effectivePriceId,
      tenantId: user.tenantId,
      successUrl: dto.successUrl ?? `${appBase}/billing/success`,
      cancelUrl: dto.cancelUrl ?? `${appBase}/billing/cancel`,
    });

    // Persist the customer id immediately so the portal works even before
    // the subscription webhook lands.
    await this.upsertSubscription(user.tenantId, { stripeCustomerId: customerId });

    await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'TENANT_SUBSCRIPTION',
      entityId: user.tenantId,
      eventType: 'BILLING_CHECKOUT_STARTED',
      eventDescription: `Checkout started for ${dto.plan}`,
      metadata: { plan: dto.plan, sessionId: session.id },
    });
    await this.recordBillingAudit(user.userId, 'CHECKOUT_STARTED', user.tenantId, {
      plan: dto.plan,
      sessionId: session.id,
    });

    return { checkoutUrl: session.url, sessionId: session.id };
  }

  async openPortal(user: AuthenticatedUser) {
    this.assertBillingConfiguredInProduction();
    const existing = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId: user.tenantId },
    });
    const customerId = await this.stripe.ensureCustomer({
      tenantId: user.tenantId,
      email: user.email,
      existingCustomerId: existing?.stripeCustomerId,
    });
    if (!existing?.stripeCustomerId) {
      await this.upsertSubscription(user.tenantId, { stripeCustomerId: customerId });
    }
    const appBase = this.config.get<string>('APP_PUBLIC_URL', 'https://app.vigiscam.local');
    const session = await this.stripe.createBillingPortalSession({
      customerId,
      returnUrl: `${appBase}/billing`,
    });
    await this.recordBillingAudit(user.userId, 'PORTAL_OPENED', user.tenantId, { customerId });
    return { portalUrl: session.url };
  }

  // ─── Enterprise manual invoice ──────────────────────────────────────────────

  async setManualInvoice(
    admin: AuthenticatedUser,
    tenantId: string,
    dto: SetManualInvoiceDto,
  ): Promise<TenantSubscription> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new BadRequestException('Tenant not found');

    const row = await this.upsertSubscription(tenantId, {
      plan: dto.plan,
      status: 'MANUAL',
      manualInvoice: true,
    });

    await this.evidence.append({
      tenantId,
      actorId: admin.userId,
      actorType: 'ADMIN',
      entityType: 'TENANT_SUBSCRIPTION',
      entityId: tenantId,
      eventType: 'BILLING_MANUAL_INVOICE_SET',
      eventDescription: `Manual-invoice billing set: ${dto.plan}`,
      metadata: { plan: dto.plan, note: dto.note ?? null },
    });
    await this.recordBillingAudit(admin.userId, 'MANUAL_INVOICE_SET', tenantId, {
      plan: dto.plan,
      note: dto.note ?? null,
    });

    return row;
  }

  // ─── Webhook processing ─────────────────────────────────────────────────────

  /**
   * Idempotent webhook handler. Dedupes on the Stripe event id; a
   * redelivery short-circuits. Recognized events drive the subscription
   * row. Unrecognized events are still logged for audit but no-op.
   */
  async handleWebhook(event: Stripe.Event): Promise<{ received: true; deduped: boolean }> {
    // Idempotency: insert the event id first. If it already exists, this
    // is a redelivery — return without reprocessing.
    const already = await this.prisma.billingEvent.findUnique({
      where: { stripeEventId: event.id },
    });
    if (already?.processedAt) {
      return { received: true, deduped: true };
    }

    const tenantId = this.extractTenantId(event);
    const logRow = already
      ? already
      : await this.prisma.billingEvent.create({
          data: {
            stripeEventId: event.id,
            type: event.type,
            tenantId: tenantId ?? null,
            payload: event as unknown as object,
          },
        });

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          const tid = session.metadata?.tenantId ?? tenantId;
          if (tid && typeof session.customer === 'string') {
            await this.upsertSubscription(tid, {
              stripeCustomerId: session.customer,
              stripeSubscriptionId:
                typeof session.subscription === 'string' ? session.subscription : undefined,
              status: 'ACTIVE',
            });
          }
          break;
        }
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;
          const tid = sub.metadata?.tenantId ?? tenantId;
          if (tid) {
            await this.applySubscriptionState(
              tid,
              sub,
              event.type === 'customer.subscription.deleted',
            );
          }
          break;
        }
        default:
          // Recognized-but-unhandled or unknown — logged, no state change.
          this.logger.debug(`Billing webhook ${event.type} logged, no state change`);
      }
    } catch (err) {
      this.logger.error(`Failed to process billing webhook ${event.id}: ${String(err)}`);
      throw err;
    }

    await this.prisma.billingEvent.update({
      where: { id: logRow.id },
      data: { processedAt: new Date(), tenantId: tenantId ?? logRow.tenantId },
    });
    return { received: true, deduped: false };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async applySubscriptionState(
    tenantId: string,
    sub: Stripe.Subscription,
    deleted: boolean,
  ): Promise<void> {
    const priceId = sub.items?.data?.[0]?.price?.id ?? null;
    const plan = this.planFromPriceId(priceId);
    const nextStatus = deleted ? 'CANCELED' : mapStripeStatus(sub.status);
    const nextPlan = deleted ? 'FREE' : plan;
    await this.upsertSubscription(tenantId, {
      plan: nextPlan,
      status: nextStatus,
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId ?? undefined,
      currentPeriodEnd: sub.current_period_end
        ? new Date(sub.current_period_end * 1000)
        : undefined,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    });
    // CP-8 — audit the webhook-driven plan/status change (SYSTEM actor).
    await this.recordBillingAudit(null, 'SUBSCRIPTION_STATE_CHANGED', tenantId, {
      plan: nextPlan,
      status: nextStatus,
      stripeSubscriptionId: sub.id,
      deleted,
    });
  }

  /** Reverse-map a Stripe price id to a plan code using the env config. */
  private planFromPriceId(priceId: string | null): BillingPlan {
    if (!priceId) return 'FREE';
    const basic = this.config.get<string>('STRIPE_PRICE_BASIC');
    const family = this.config.get<string>('STRIPE_PRICE_FAMILY_GUARDIAN');
    const premium = this.config.get<string>('STRIPE_PRICE_PREMIUM_SHIELD');
    if (premium && priceId === premium) return 'PREMIUM_SHIELD';
    if (family && priceId === family) return 'FAMILY_GUARDIAN';
    if (basic && priceId === basic) return 'BASIC';
    // Stub price ids carry the plan code in the suffix.
    if (priceId.endsWith('PREMIUM_SHIELD')) return 'PREMIUM_SHIELD';
    if (priceId.endsWith('FAMILY_GUARDIAN')) return 'FAMILY_GUARDIAN';
    if (priceId.endsWith('BASIC')) return 'BASIC';
    return 'FREE';
  }

  private extractTenantId(event: Stripe.Event): string | undefined {
    const obj = event.data.object as { metadata?: Record<string, string> };
    return obj?.metadata?.tenantId;
  }

  private upsertSubscription(
    tenantId: string,
    data: Partial<{
      plan: BillingPlan;
      status: SubscriptionStatus;
      stripeCustomerId: string;
      stripeSubscriptionId: string;
      stripePriceId: string;
      currentPeriodEnd: Date;
      cancelAtPeriodEnd: boolean;
      manualInvoice: boolean;
    }>,
  ): Promise<TenantSubscription> {
    return this.prisma.tenantSubscription.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: { ...data },
    });
  }

  /**
   * CP-8 — in production, billing must run against real Stripe. Refuse to issue
   * stub checkout/portal URLs (reviewer #9: "remove placeholder checkout/portal
   * behavior from production mode"). Stub mode stays available in dev/test.
   */
  private assertBillingConfiguredInProduction(): void {
    const isProd = this.config.get<string>('nodeEnv') === 'production';
    if (isProd && !this.stripe.isConfigured()) {
      throw new ServiceUnavailableException(
        'Billing is not available: Stripe is not configured in this environment.',
      );
    }
  }

  /** CP-8 — write an AuditLog row for every billing change. */
  private async recordBillingAudit(
    actorId: string | null,
    action: string,
    tenantId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.auditLog
      .create({
        data: {
          actorId,
          actorType: actorId ? 'USER' : 'SYSTEM',
          action: `BILLING_${action}`,
          targetType: 'TENANT_SUBSCRIPTION',
          targetId: tenantId,
          metadata: metadata as never,
        },
      })
      .catch((err: unknown) => this.logger.warn(`billing audit write failed: ${String(err)}`));
  }

  /** CP-8 — admin audit surface: the recorded Stripe billing events. */
  listBillingEvents(tenantId?: string, limit = 100) {
    return this.prisma.billingEvent.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
      select: {
        id: true,
        stripeEventId: true,
        type: true,
        tenantId: true,
        processedAt: true,
        createdAt: true,
      },
    });
  }
}
