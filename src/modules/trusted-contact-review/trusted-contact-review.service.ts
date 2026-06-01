import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  TrustedContact,
  TrustedContactReview,
  TrustedContactReviewDecision,
  TrustedContactReviewStatus,
  TrustedContactReviewTriggerModule,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { NotificationService } from '../notifications/notification.service';

/**
 * Trusted-contact review workflow (Phase 9H).
 *
 * Two entry points:
 *  - **`requestReview()`** — typed internal API the protection modules
 *    (9B ScamHold, 9C GiftCardGuard, 9D WalletGuard, 9E ClaimVerify,
 *    9F ScamMirror, 9A Guardian Pause CRITICAL path) call when a user
 *    elects ESCALATED_TO_TRUSTED_CONTACT. Opens a review row, picks
 *    the user's first ACTIVE+canApproveHighRiskActions trusted contact
 *    (if none specified), fires email + SMS via 8E NotificationService,
 *    and returns the review id back to the caller for the soft-FK
 *    column on the triggering row.
 *  - **`decide()`** — the trusted contact records their decision via
 *    a tokenised link in the notification (or via the user's app if
 *    they have a VIGISCAM account too).
 */

export interface RequestReviewInput {
  /** The user being protected. */
  user: AuthenticatedUser;
  triggerModule: TrustedContactReviewTriggerModule;
  triggerEventId: string;
  triggerSummary: string;
  /** When provided, addresses a specific contact; otherwise picks the
   *  first canApproveHighRiskActions contact. */
  contactId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class TrustedContactReviewService {
  private readonly logger = new Logger(TrustedContactReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly notifications: NotificationService,
  ) {}

  async requestReview(input: RequestReviewInput): Promise<TrustedContactReview | null> {
    const contact = await this.resolveContact(input);
    if (!contact) {
      this.logger.warn(
        `requestReview: user=${input.user.userId} has no eligible trusted contact — skipping`,
      );
      return null;
    }

    const token = this.generateContactToken();
    const created = await this.prisma.trustedContactReview.create({
      data: {
        userId: input.user.userId,
        tenantId: input.user.tenantId,
        contactId: contact.id,
        triggerModule: input.triggerModule,
        triggerEventId: input.triggerEventId,
        triggerSummary: input.triggerSummary,
        decidedByContactToken: token,
        metadata: input.metadata as never,
      },
    });

    const evidence = await this.evidence.append({
      tenantId: input.user.tenantId,
      actorId: input.user.userId,
      actorType: 'USER',
      entityType: 'TRUSTED_CONTACT_REVIEW',
      entityId: created.id,
      eventType: 'TRUSTED_CONTACT_REVIEW_REQUESTED',
      eventDescription:
        `Review requested from ${contact.fullName} ` + `(${input.triggerModule.toLowerCase()})`,
      metadata: {
        triggerModule: input.triggerModule,
        triggerEventId: input.triggerEventId,
        contactRelationship: contact.relationship ?? null,
      },
    });

    const linked = await this.prisma.trustedContactReview.update({
      where: { id: created.id },
      data: { evidenceEventId: evidence.id },
    });

    await this.fanOutNotifications(contact, linked, input.triggerSummary, token);

    return linked;
  }

  async decide(
    reviewId: string,
    args: {
      decision: TrustedContactReviewDecision;
      notes?: string;
      /** Token from the original notification — required for contacts
       *  who aren't logged-in VIGISCAM users. */
      decidedByContactToken?: string;
      /** Optional: a logged-in user calling this surface. Bypasses token. */
      caller?: AuthenticatedUser;
    },
  ): Promise<TrustedContactReview> {
    const existing = await this.prisma.trustedContactReview.findUnique({
      where: { id: reviewId },
    });
    if (!existing) {
      throw new NotFoundException('Trusted-contact review not found');
    }
    if (existing.status !== ('PENDING' as TrustedContactReviewStatus)) {
      throw new BadRequestException(`Review already in terminal state (${existing.status})`);
    }
    // Either the protected user themselves (or an internal admin), OR a
    // contact with the matching one-time token, can record the decision.
    const callerOwnsReview =
      args.caller?.userId === existing.userId || args.caller?.role === 'SUPER_ADMIN';
    const tokenMatches =
      Boolean(existing.decidedByContactToken) &&
      args.decidedByContactToken === existing.decidedByContactToken;
    if (!callerOwnsReview && !tokenMatches) {
      throw new BadRequestException(
        'Decision requires either the protected user / admin to be logged in, or the one-time decidedByContactToken',
      );
    }

    const updated = await this.prisma.trustedContactReview.update({
      where: { id: existing.id },
      data: {
        status: 'DECIDED',
        decision: args.decision,
        decisionNotes: args.notes ?? null,
        decidedAt: new Date(),
        // Burn the token on use so the link can't be replayed.
        decidedByContactToken: null,
      },
    });

    await this.evidence.append({
      tenantId: existing.tenantId,
      actorId: args.caller?.userId ?? null,
      actorType: args.caller ? 'USER' : 'EXTERNAL_TRUSTED_CONTACT',
      entityType: 'TRUSTED_CONTACT_REVIEW',
      entityId: existing.id,
      eventType: `TRUSTED_CONTACT_REVIEW_${args.decision}`,
      eventDescription: `Trusted contact recorded decision: ${args.decision}`,
      metadata: { decision: args.decision, notes: args.notes ?? null },
    });

    this.logger.log(
      `Trusted-contact review ${existing.id} → ${args.decision} (module=${existing.triggerModule})`,
    );

    return updated;
  }

  /**
   * Find the active reviews for a given trigger event id. Used by the
   * protection modules' history endpoints to fold the contact's
   * decision into the response.
   */
  findByTrigger(
    triggerModule: TrustedContactReviewTriggerModule,
    triggerEventId: string,
  ): Promise<TrustedContactReview | null> {
    return this.prisma.trustedContactReview.findFirst({
      where: { triggerModule, triggerEventId },
      orderBy: { requestedAt: 'desc' },
    });
  }

  list(user: AuthenticatedUser, limit = 50): Promise<TrustedContactReview[]> {
    return this.prisma.trustedContactReview.findMany({
      where: { userId: user.userId },
      orderBy: { requestedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  // ───────────────────────────────────────────────────────────────────────────

  private async resolveContact(input: RequestReviewInput): Promise<TrustedContact | null> {
    if (input.contactId) {
      return this.prisma.trustedContact.findFirst({
        where: {
          id: input.contactId,
          userId: input.user.userId,
          status: 'ACTIVE',
        },
      });
    }
    // No explicit contact — pick the first ACTIVE one with
    // canApproveHighRiskActions. Falls back to any active alert-capable
    // contact if no approver is configured.
    const approver = await this.prisma.trustedContact.findFirst({
      where: {
        userId: input.user.userId,
        status: 'ACTIVE',
        canApproveHighRiskActions: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (approver) return approver;
    return this.prisma.trustedContact.findFirst({
      where: {
        userId: input.user.userId,
        status: 'ACTIVE',
        canReceiveAlerts: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async fanOutNotifications(
    contact: TrustedContact,
    review: TrustedContactReview,
    summary: string,
    token: string,
  ): Promise<void> {
    const subject = 'A trusted contact decision is needed';
    const body =
      `${contact.fullName}, the person who lists you as a trusted ` +
      `contact in VIGISCAM has hit a risky situation:\n\n` +
      `  ${summary}\n\n` +
      `Decide here: https://vigiscam.com/review/${review.id}?token=${token}`;

    if (contact.email) {
      await this.notifications
        .send({
          channel: 'EMAIL',
          recipient: contact.email,
          subject,
          body,
          templateKey: 'trusted-contact.review-request',
          tenantId: review.tenantId,
          metadata: { reviewId: review.id, triggerModule: review.triggerModule },
        })
        .catch((err: unknown) => this.logger.warn(`email fan-out failed: ${String(err)}`));
    }
    if (contact.phone) {
      await this.notifications
        .send({
          channel: 'SMS',
          recipient: contact.phone,
          subject,
          // SMS body intentionally short + status-based, no PII.
          body: `VIGISCAM: ${summary} Decide: https://vigiscam.com/review/${review.id}?token=${token}`,
          templateKey: 'trusted-contact.review-request',
          tenantId: review.tenantId,
          metadata: { reviewId: review.id, triggerModule: review.triggerModule },
        })
        .catch((err: unknown) => this.logger.warn(`sms fan-out failed: ${String(err)}`));
    }
  }

  private generateContactToken(): string {
    return randomBytes(24).toString('base64url');
  }
}
