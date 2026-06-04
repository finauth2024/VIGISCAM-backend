import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

/**
 * Thin Stripe wrapper (Phase 11A) with the same graceful-degradation
 * contract as the 8D Blob service and 8E notification adapters:
 *
 *   - STRIPE_SECRET_KEY set  → real Stripe client.
 *   - STRIPE_SECRET_KEY unset → STUB mode. Every method returns a
 *     deterministic fake so the app boots, deploys, and the billing
 *     endpoints are exercisable in dev/CI without real Stripe creds.
 *
 * Webhook signature verification is only enforced when both the key and
 * STRIPE_WEBHOOK_SECRET are present. In stub mode the raw body is parsed
 * as JSON directly so local webhook simulation still works.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly client: Stripe | null;
  private readonly webhookSecret: string | null;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    this.webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET') ?? null;
    if (!key) {
      this.logger.warn(
        'No STRIPE_SECRET_KEY — billing runs in STUB mode. Checkout/portal ' +
          'return placeholder URLs and webhooks are parsed without signature ' +
          'verification. Set STRIPE_SECRET_KEY (+ STRIPE_WEBHOOK_SECRET) to enable real billing.',
      );
      this.client = null;
    } else {
      // No apiVersion pin — the SDK ships its own matching default, so we
      // avoid a literal-type mismatch when the pinned dep is upgraded.
      this.client = new Stripe(key);
      this.logger.log('Stripe billing ready (live client).');
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Run a Stripe SDK call and convert any failure into a clean HTTP error
   * instead of a bare 500. A misconfiguration (e.g. a price id that doesn't
   * exist in this key's mode/account) is a 400 so the message is actionable;
   * a genuine Stripe/upstream outage is a 502. The Stripe message + code are
   * preserved so the cause is visible without digging through container logs.
   */
  private async stripeCall<T>(op: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      const e = err as Stripe.errors.StripeError;
      const detail = e?.message ?? String(err);
      const code = e?.code ? ` [${e.code}]` : '';
      this.logger.error(`Stripe ${op} failed: ${detail}${code}`);
      if (e?.type === 'StripeInvalidRequestError') {
        throw new BadRequestException(`Stripe ${op} failed: ${detail}${code}`);
      }
      throw new BadGatewayException(`Stripe ${op} failed: ${detail}${code}`);
    }
  }

  /** Find-or-create a Stripe customer for a tenant. Stub returns a fake id. */
  async ensureCustomer(args: {
    tenantId: string;
    email: string;
    existingCustomerId?: string | null;
  }): Promise<string> {
    if (!this.client) {
      return args.existingCustomerId ?? `cus_stub_${args.tenantId.slice(0, 8)}`;
    }
    if (args.existingCustomerId) return args.existingCustomerId;
    const customer = await this.stripeCall('customers.create', () =>
      this.client!.customers.create({
        email: args.email,
        metadata: { tenantId: args.tenantId },
      }),
    );
    return customer.id;
  }

  /** Create a Checkout session for a subscription. Stub returns a fake URL. */
  async createCheckoutSession(args: {
    customerId: string;
    priceId: string;
    tenantId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ id: string; url: string | null }> {
    if (!this.client) {
      return {
        id: `cs_stub_${args.tenantId.slice(0, 8)}`,
        url: `https://stub.billing.local/checkout?tenant=${args.tenantId}&price=${args.priceId}`,
      };
    }
    const session = await this.stripeCall('checkout.sessions.create', () =>
      this.client!.checkout.sessions.create({
        mode: 'subscription',
        customer: args.customerId,
        line_items: [{ price: args.priceId, quantity: 1 }],
        success_url: args.successUrl,
        cancel_url: args.cancelUrl,
        metadata: { tenantId: args.tenantId },
        subscription_data: { metadata: { tenantId: args.tenantId } },
      }),
    );
    return { id: session.id, url: session.url };
  }

  /** Create a Billing Portal session so a tenant can manage their card. */
  async createBillingPortalSession(args: {
    customerId: string;
    returnUrl: string;
  }): Promise<{ url: string }> {
    if (!this.client) {
      return { url: `https://stub.billing.local/portal?customer=${args.customerId}` };
    }
    const session = await this.stripeCall('billingPortal.sessions.create', () =>
      this.client!.billingPortal.sessions.create({
        customer: args.customerId,
        return_url: args.returnUrl,
      }),
    );
    return { url: session.url };
  }

  /**
   * Verify + parse a webhook payload. In live mode the signature is
   * checked against STRIPE_WEBHOOK_SECRET. In stub mode (or when no
   * webhook secret is configured) the raw body is parsed as JSON so
   * local simulation works — callers must treat stub events as untrusted.
   */
  constructWebhookEvent(rawBody: Buffer | string, signature: string | undefined): Stripe.Event {
    if (this.client && this.webhookSecret && signature) {
      return this.client.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    }
    // Stub / no-secret path — parse directly. Never trust in production.
    const text = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
    return JSON.parse(text) as Stripe.Event;
  }
}
