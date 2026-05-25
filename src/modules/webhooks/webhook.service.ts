import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  WebhookDelivery,
  WebhookEventType,
  WebhookSubscription,
} from '@prisma/client';
import { createHmac, randomBytes, randomUUID } from 'crypto';
import { AuthenticatedUser, RequestContext } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { CreateWebhookSubscriptionDto } from './dto/create-webhook-subscription.dto';

/** How long we wait for a partner endpoint before giving up. */
const DELIVERY_TIMEOUT_MS = 10_000;

export interface IssuedWebhookSubscription {
  /** The shared HMAC secret — returned exactly ONCE. */
  rawSecret: string;
  record: Omit<WebhookSubscription, 'secret'>;
}

/**
 * Outbound webhooks (PDF §43 webhook support; docs/02 Phase 5). Partners
 * subscribe to event types; VIGISCAM POSTs each event to their URL with a
 * Stripe-style HMAC-SHA256 signature so the partner can verify authenticity.
 *
 * Delivery is fire-and-forget: a webhook failure NEVER blocks or fails the
 * triggering business action. Every attempt is persisted for audit /
 * debugging.
 *
 * The HMAC secret is stored in plain text and relies on Azure PostgreSQL's
 * at-rest encryption (TDE). TODO: rotate to AES-GCM with a Key Vault key
 * before production.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
  ) {}

  // ─────────────── Management (admin-only) ───────────────

  async createSubscription(
    actor: AuthenticatedUser,
    dto: CreateWebhookSubscriptionDto,
    ctx: RequestContext = {},
  ): Promise<IssuedWebhookSubscription> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const rawSecret = this.generateSecret();
    const record = await this.prisma.webhookSubscription.create({
      data: {
        tenantId: dto.tenantId,
        url: dto.url,
        secret: rawSecret,
        eventTypes: dto.eventTypes,
        label: dto.label,
        createdByUserId: actor.userId,
      },
    });

    await this.evidence.append({
      tenantId: tenant.id,
      actorId: actor.userId,
      actorType: 'ADMIN',
      entityType: 'WEBHOOK_SUBSCRIPTION',
      entityId: record.id,
      eventType: 'WEBHOOK_SUBSCRIPTION_CREATED',
      eventDescription: `Webhook subscription created for ${tenant.name} -> ${dto.url}`,
      metadata: { tenantId: tenant.id, eventTypes: dto.eventTypes, url: dto.url },
      ipAddress: ctx.ip ?? null,
    });

    const { secret: _omit, ...safe } = record;
    return { rawSecret, record: safe };
  }

  listSubscriptions(tenantId?: string) {
    return this.prisma.webhookSubscription.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        tenantId: true,
        url: true,
        eventTypes: true,
        status: true,
        label: true,
        createdAt: true,
        updatedAt: true,
        revokedAt: true,
      },
    });
  }

  async revokeSubscription(
    actor: AuthenticatedUser,
    id: string,
    ctx: RequestContext = {},
  ): Promise<WebhookSubscription> {
    const sub = await this.prisma.webhookSubscription.findUnique({ where: { id } });
    if (!sub) {
      throw new NotFoundException('Webhook subscription not found');
    }
    if (sub.status === 'REVOKED') {
      return sub;
    }
    const updated = await this.prisma.webhookSubscription.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    await this.evidence.append({
      tenantId: sub.tenantId,
      actorId: actor.userId,
      actorType: 'ADMIN',
      entityType: 'WEBHOOK_SUBSCRIPTION',
      entityId: sub.id,
      eventType: 'WEBHOOK_SUBSCRIPTION_REVOKED',
      eventDescription: 'Webhook subscription revoked',
      metadata: { tenantId: sub.tenantId, url: sub.url },
      ipAddress: ctx.ip ?? null,
    });
    return updated;
  }

  /** Recent delivery attempts for one subscription — debugging surface. */
  listDeliveries(subscriptionId: string, limit = 100) {
    return this.prisma.webhookDelivery.findMany({
      where: { subscriptionId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
      select: {
        id: true,
        eventType: true,
        status: true,
        responseStatus: true,
        responseBody: true,
        error: true,
        attempt: true,
        deliveredAt: true,
        succeededAt: true,
        createdAt: true,
      },
    });
  }

  // ─────────────── Publish + deliver ───────────────

  /**
   * Publish an event to every matching ACTIVE subscription for this tenant.
   * Fire-and-forget per delivery — never blocks or fails the caller.
   * No-op for events that have no owning tenant.
   */
  async publish(
    eventType: WebhookEventType,
    tenantId: string | null,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!tenantId) {
      return;
    }
    const subs = await this.prisma.webhookSubscription.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        eventTypes: { has: eventType },
      },
    });
    for (const sub of subs) {
      void this.deliver(sub, eventType, data);
    }
  }

  private async deliver(
    sub: WebhookSubscription,
    eventType: WebhookEventType,
    data: Record<string, unknown>,
  ): Promise<WebhookDelivery | null> {
    const timestamp = Math.floor(Date.now() / 1000);
    const envelope = {
      id: randomUUID(),
      eventType,
      tenantId: sub.tenantId,
      occurredAt: new Date(timestamp * 1000).toISOString(),
      data,
    };
    const body = JSON.stringify(envelope);
    const signedPayload = `${timestamp}.${body}`;
    const signature = createHmac('sha256', sub.secret).update(signedPayload).digest('hex');
    const sigHeader = `t=${timestamp},v1=${signature}`;

    let delivery: WebhookDelivery;
    try {
      delivery = await this.prisma.webhookDelivery.create({
        data: {
          subscriptionId: sub.id,
          tenantId: sub.tenantId,
          eventType,
          payload: envelope as unknown as Prisma.InputJsonValue,
          signature: sigHeader,
          deliveredAt: new Date(),
        },
      });
    } catch (err) {
      this.logger.error(`Failed to persist webhook delivery for ${sub.id}: ${String(err)}`);
      return null;
    }

    try {
      const res = await fetch(sub.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-VIGISCAM-Signature': sigHeader,
          'X-VIGISCAM-Event': eventType,
          'X-VIGISCAM-Delivery-Id': delivery.id,
        },
        body,
        signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
      });
      const text = await res.text();
      await this.prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: res.ok ? 'SUCCEEDED' : 'FAILED',
          responseStatus: res.status,
          responseBody: text.slice(0, 2000),
          succeededAt: res.ok ? new Date() : null,
        },
      });
    } catch (err) {
      await this.prisma.webhookDelivery
        .update({
          where: { id: delivery.id },
          data: { status: 'FAILED', error: String(err).slice(0, 2000) },
        })
        .catch(() => undefined);
      this.logger.warn(`Webhook delivery ${delivery.id} failed: ${String(err)}`);
    }
    return delivery;
  }

  /** Format: `whsec_<40 hex chars>` — 160 bits of entropy. */
  private generateSecret(): string {
    return `whsec_${randomBytes(20).toString('hex')}`;
  }
}
