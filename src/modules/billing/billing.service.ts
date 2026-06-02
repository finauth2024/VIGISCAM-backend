import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PartnerApiKeyPlan, TenantSubscription } from '@prisma/client';
import type Stripe from 'stripe';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import {
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
    plan: PartnerApiKeyPlan;
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
      plan: row?.plan ?? 'FREE',
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
  async resolveEffectivePlan(tenantId: string): Promise<PartnerApiKeyPlan> {
    const row = await this.prisma.tenantSubscription.findUnique({ where: { tenantId } });
    if (!row) return 'FREE';
    if (!ENTITLED_STATUSES.includes(row.status as SubscriptionStatus)) return 'FREE';
    return row.plan;
  }

  // ─── Checkout + portal ──────────────────────────────────────────────────────

  async startCheckout(user: AuthenticatedUser, dto: StartCheckoutDto) {
    if (!PURCHASABLE_PLANS.includes(dto.plan)) {
      throw new BadRequestException('Only PRO and ENTERPRISE plans are purchasable');
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

    return { checkoutUrl: session.url, sessionId: session.id };
  }

  async openPortal(user: AuthenticatedUser) {
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
    await this.upsertSubscription(tenantId, {
      plan: deleted ? 'FREE' : plan,
      status: deleted ? 'CANCELED' : mapStripeStatus(sub.status),
      stripeSubscriptionId: sub.id,
      stripePriceId: priceId ?? undefined,
      currentPeriodEnd: sub.current_period_end
        ? new Date(sub.current_period_end * 1000)
        : undefined,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    });
  }

  /** Reverse-map a Stripe price id to a plan tier using the env config. */
  private planFromPriceId(priceId: string | null): PartnerApiKeyPlan {
    if (!priceId) return 'FREE';
    const proPrice = this.config.get<string>('STRIPE_PRICE_PRO');
    const entPrice = this.config.get<string>('STRIPE_PRICE_ENTERPRISE');
    if (entPrice && priceId === entPrice) return 'ENTERPRISE';
    if (proPrice && priceId === proPrice) return 'PRO';
    // Stub price ids carry the plan in the suffix.
    if (priceId.endsWith('ENTERPRISE')) return 'ENTERPRISE';
    if (priceId.endsWith('PRO')) return 'PRO';
    return 'FREE';
  }

  private extractTenantId(event: Stripe.Event): string | undefined {
    const obj = event.data.object as { metadata?: Record<string, string> };
    return obj?.metadata?.tenantId;
  }

  private upsertSubscription(
    tenantId: string,
    data: Partial<{
      plan: PartnerApiKeyPlan;
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
}
