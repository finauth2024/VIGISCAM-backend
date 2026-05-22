import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { GuardianLink } from '@prisma/client';
import { AuthenticatedUser, RequestContext } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { RequestGuardianshipDto } from './dto/request-guardianship.dto';

const DEFAULT_SCOPE = ['RISK_OVERVIEW', 'ALERTS'];

/**
 * The consent-based guardianship workflow (PDF §9.2). Monitoring only becomes
 * ACTIVE after the protected user explicitly grants consent, the protected user
 * can revoke it at any time, and every guardian data access is recorded in the
 * tamper-evident Evidence Vault.
 */
@Injectable()
export class GuardianshipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
  ) {}

  async requestGuardianship(
    guardian: AuthenticatedUser,
    dto: RequestGuardianshipDto,
    ctx: RequestContext = {},
  ): Promise<GuardianLink> {
    const email = dto.protectedUserEmail.toLowerCase().trim();
    const protectedUser = await this.prisma.user.findUnique({ where: { email } });
    if (!protectedUser) {
      throw new NotFoundException('No VIGISCAM account with that email');
    }
    if (protectedUser.id === guardian.userId) {
      throw new BadRequestException('You cannot request guardianship of your own account');
    }

    const existing = await this.prisma.guardianLink.findUnique({
      where: {
        guardianUserId_protectedUserId: {
          guardianUserId: guardian.userId,
          protectedUserId: protectedUser.id,
        },
      },
    });
    if (existing && (existing.status === 'PENDING' || existing.status === 'ACTIVE')) {
      throw new ConflictException('A guardianship request already exists for this person');
    }

    const link = existing
      ? await this.prisma.guardianLink.update({
          where: { id: existing.id },
          data: {
            status: 'PENDING',
            scope: DEFAULT_SCOPE,
            requestedAt: new Date(),
            consentGrantedAt: null,
            consentRevokedAt: null,
          },
        })
      : await this.prisma.guardianLink.create({
          data: {
            tenantId: guardian.tenantId,
            guardianUserId: guardian.userId,
            protectedUserId: protectedUser.id,
            scope: DEFAULT_SCOPE,
          },
        });

    await this.logEvidence(link, guardian.userId, 'USER', 'GUARDIANSHIP_REQUESTED',
      'Guardianship requested; awaiting protected-user consent', ctx);
    return link;
  }

  listAsGuardian(user: AuthenticatedUser): Promise<GuardianLink[]> {
    return this.prisma.guardianLink.findMany({
      where: { guardianUserId: user.userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  listAsProtected(user: AuthenticatedUser): Promise<GuardianLink[]> {
    return this.prisma.guardianLink.findMany({
      where: { protectedUserId: user.userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** The protected user grants consent — the only thing that activates monitoring. */
  async grantConsent(user: AuthenticatedUser, id: string, ctx: RequestContext = {}): Promise<GuardianLink> {
    const link = await this.requireProtectedUserLink(user, id);
    if (link.status !== 'PENDING') {
      throw new BadRequestException('This guardianship request is not pending');
    }
    const updated = await this.prisma.guardianLink.update({
      where: { id },
      data: { status: 'ACTIVE', consentGrantedAt: new Date() },
    });
    await this.logEvidence(updated, user.userId, 'USER', 'CONSENT_GRANTED',
      'Protected user granted monitoring consent', ctx);
    return updated;
  }

  async declineConsent(user: AuthenticatedUser, id: string, ctx: RequestContext = {}): Promise<GuardianLink> {
    const link = await this.requireProtectedUserLink(user, id);
    if (link.status !== 'PENDING') {
      throw new BadRequestException('This guardianship request is not pending');
    }
    const updated = await this.prisma.guardianLink.update({
      where: { id },
      data: { status: 'DECLINED' },
    });
    await this.logEvidence(updated, user.userId, 'USER', 'CONSENT_DECLINED',
      'Protected user declined the guardianship request', ctx);
    return updated;
  }

  /** The protected user revokes consent — monitoring stops immediately. */
  async revokeConsent(user: AuthenticatedUser, id: string, ctx: RequestContext = {}): Promise<GuardianLink> {
    const link = await this.requireProtectedUserLink(user, id);
    if (link.status !== 'ACTIVE') {
      throw new BadRequestException('This guardianship is not active');
    }
    const updated = await this.prisma.guardianLink.update({
      where: { id },
      data: { status: 'REVOKED', consentRevokedAt: new Date() },
    });
    await this.logEvidence(updated, user.userId, 'USER', 'CONSENT_REVOKED',
      'Protected user revoked monitoring consent', ctx);
    return updated;
  }

  /**
   * A guardian views a protected user's summary. Allowed ONLY while consent is
   * ACTIVE, and every access is written to the tamper-evident Evidence Vault.
   */
  async getProtectedSummary(guardian: AuthenticatedUser, id: string, ctx: RequestContext = {}) {
    const link = await this.prisma.guardianLink.findUnique({
      where: { id },
      include: { protectedUser: true },
    });
    if (!link || link.guardianUserId !== guardian.userId) {
      throw new NotFoundException('Guardianship not found');
    }
    if (link.status !== 'ACTIVE') {
      throw new ForbiddenException('Monitoring is not active — consent was not granted or has been revoked');
    }

    const [recentRiskEvents, openAlerts] = await Promise.all([
      this.prisma.riskEvent.findMany({
        where: { userId: link.protectedUserId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.alert.count({ where: { userId: link.protectedUserId, readAt: null } }),
    ]);

    await this.logEvidence(link, guardian.userId, 'GUARDIAN', 'GUARDIAN_ACCESSED_PROTECTED_USER',
      `Guardian viewed the protected user's risk summary`, ctx);

    return {
      protectedUser: { id: link.protectedUser.id, fullName: link.protectedUser.fullName },
      scope: link.scope,
      consentGrantedAt: link.consentGrantedAt,
      openAlerts,
      recentRiskEvents: recentRiskEvents.map((r) => ({
        id: r.id,
        eventType: r.eventType,
        riskLevel: r.riskLevel,
        riskScore: r.riskScore,
        createdAt: r.createdAt,
      })),
    };
  }

  private async requireProtectedUserLink(user: AuthenticatedUser, id: string): Promise<GuardianLink> {
    const link = await this.prisma.guardianLink.findUnique({ where: { id } });
    if (!link || link.protectedUserId !== user.userId) {
      throw new NotFoundException('Guardianship request not found');
    }
    return link;
  }

  private logEvidence(
    link: GuardianLink,
    actorId: string,
    actorType: string,
    eventType: string,
    description: string,
    ctx: RequestContext,
  ): Promise<unknown> {
    return this.evidence.append({
      tenantId: link.tenantId,
      actorId,
      actorType,
      entityType: 'GUARDIAN_LINK',
      entityId: link.id,
      eventType,
      eventDescription: description,
      metadata: { guardianUserId: link.guardianUserId, protectedUserId: link.protectedUserId },
      ipAddress: ctx.ip ?? null,
    });
  }
}
