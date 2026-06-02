import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantType } from '@prisma/client';
import { AuthenticatedUser, RequestContext } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { ListTenantsQueryDto } from './dto/list-tenants-query.dto';
import { ModuleEventsQueryDto, OversightModule } from './dto/module-events-query.dto';
import { SetTenantStatusDto } from './dto/set-tenant-status.dto';
import { INTERNAL_TENANT_ID } from './internal.constants';

/**
 * Internal-staff cross-tenant oversight (Phase 10F).
 *
 * The role-portal services (10B–10E) each scope every read to the
 * caller's own tenant. VIGISCAM staff need the opposite: a bird's-eye
 * view across all tenants to manage the Phase 9 protection modules and
 * the role portals. This service is that view.
 *
 * It is read-mostly. The single mutation — suspending or reactivating a
 * tenant — is SUPER_ADMIN-only (enforced at the controller) and is
 * written to the INTERNAL tenant's evidence chain.
 */
@Injectable()
export class OversightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
  ) {}

  // ─── Platform-wide overview ─────────────────────────────────────────────────

  async platformOverview() {
    const [
      guardianPauses,
      guardianActive,
      scamHolds,
      giftCardWarnings,
      walletChecks,
      claimVerifications,
      scamMirrorSessions,
      trustedContactReviews,
      trustedContactPending,
      bankCaseReviews,
      tellerAssistScores,
      groomingChecks,
      platformModerations,
      investigatorCases,
      investigatorOpenCases,
      enterprisePolicies,
      enterpriseIntegrations,
    ] = await Promise.all([
      this.prisma.pauseEvent.count(),
      this.prisma.pauseEvent.count({ where: { status: 'ACTIVE' } }),
      this.prisma.scamHoldEvent.count(),
      this.prisma.giftCardWarning.count(),
      this.prisma.walletCheck.count(),
      this.prisma.claimVerification.count(),
      this.prisma.scamMirrorSession.count(),
      this.prisma.trustedContactReview.count(),
      this.prisma.trustedContactReview.count({ where: { status: 'PENDING' } }),
      this.prisma.bankCaseReview.count(),
      this.prisma.tellerAssistScore.count(),
      this.prisma.groomingCheckScore.count(),
      this.prisma.platformModerationDecision.count(),
      this.prisma.investigatorCase.count(),
      this.prisma.investigatorCase.count({ where: { status: { not: 'CLOSED' } } }),
      this.prisma.enterprisePolicy.count(),
      this.prisma.enterpriseIntegration.count(),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      protectionModules: {
        guardianPause: { total: guardianPauses, active: guardianActive },
        scamHold: { total: scamHolds },
        giftCardGuard: { total: giftCardWarnings },
        walletGuard: { total: walletChecks },
        claimVerify: { total: claimVerifications },
        scamMirror: { total: scamMirrorSessions },
        trustedContactReview: {
          total: trustedContactReviews,
          pending: trustedContactPending,
        },
      },
      rolePortals: {
        bankGuard: { caseReviews: bankCaseReviews, tellerScores: tellerAssistScores },
        platformShield: {
          groomingChecks,
          moderationDecisions: platformModerations,
        },
        investigator: { cases: investigatorCases, open: investigatorOpenCases },
        enterprise: {
          policies: enterprisePolicies,
          integrations: enterpriseIntegrations,
        },
      },
    };
  }

  // ─── Per-module recent events (cross-tenant) ────────────────────────────────

  async moduleEvents(query: ModuleEventsQueryDto) {
    const take = query.limit ?? 50;
    const where = query.tenantId ? { tenantId: query.tenantId } : {};
    const orderBy = { createdAt: 'desc' as const };

    switch (query.module) {
      case OversightModule.GUARDIAN_PAUSE:
        return this.prisma.pauseEvent.findMany({ where, orderBy, take });
      case OversightModule.SCAMHOLD:
        return this.prisma.scamHoldEvent.findMany({ where, orderBy, take });
      case OversightModule.GIFTCARDGUARD:
        return this.prisma.giftCardWarning.findMany({ where, orderBy, take });
      case OversightModule.WALLETGUARD:
        return this.prisma.walletCheck.findMany({ where, orderBy, take });
      case OversightModule.CLAIMVERIFY:
        return this.prisma.claimVerification.findMany({ where, orderBy, take });
      case OversightModule.SCAMMIRROR:
        return this.prisma.scamMirrorSession.findMany({ where, orderBy, take });
      case OversightModule.TRUSTED_CONTACT_REVIEW:
        return this.prisma.trustedContactReview.findMany({ where, orderBy, take });
      default:
        // Exhaustive — the DTO enum guarantees we never reach here, but
        // TypeScript wants a terminal branch.
        throw new BadRequestException('Unknown module');
    }
  }

  // ─── Tenant oversight ───────────────────────────────────────────────────────

  listTenants(query: ListTenantsQueryDto) {
    return this.prisma.tenant.findMany({
      where: {
        ...(query.type ? { type: query.type } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 100,
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        createdAt: true,
        _count: { select: { memberships: true, devices: true } },
      },
    });
  }

  async setTenantStatus(
    admin: AuthenticatedUser,
    tenantId: string,
    dto: SetTenantStatusDto,
    ctx: RequestContext = {},
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, type: true, status: true, name: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    // The INTERNAL tenant can never be suspended — that would lock out
    // VIGISCAM staff and break the evidence chain's home tenant.
    if (tenant.type === TenantType.INTERNAL && dto.status !== 'ACTIVE') {
      throw new BadRequestException('The internal VIGISCAM tenant cannot be suspended or closed');
    }
    if (tenant.status === dto.status) {
      throw new BadRequestException(`Tenant is already ${dto.status}`);
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: dto.status },
    });

    await this.evidence.append({
      tenantId: INTERNAL_TENANT_ID,
      actorId: admin.userId,
      actorType: 'ADMIN',
      entityType: 'TENANT',
      entityId: tenantId,
      eventType: 'INTERNAL_TENANT_STATUS_CHANGED',
      eventDescription: `Tenant "${tenant.name}" status changed ${tenant.status} -> ${dto.status}`,
      metadata: {
        tenantId,
        previousStatus: tenant.status,
        newStatus: dto.status,
        reason: dto.reason ?? null,
      },
      ipAddress: ctx.ip ?? null,
    });

    return updated;
  }
}
