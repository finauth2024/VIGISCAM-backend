import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Monthly list price per plan (USD) — mirrors the public pricing page. */
const PLAN_PRICE: Record<string, number> = {
  FREE: 0,
  BASIC: 9.99,
  FAMILY_GUARDIAN: 19.99,
  PREMIUM_SHIELD: 39.99,
};

const PLAN_LABEL: Record<string, string> = {
  FREE: 'Free',
  BASIC: 'Basic',
  FAMILY_GUARDIAN: 'Family Guardian',
  PREMIUM_SHIELD: 'Premium Shield',
};

/**
 * Read-only data layer for the internal Admin console (FE-6). Each method backs
 * one admin page. Surfaces with no underlying data model yet (compliance,
 * support, settings) return a stable empty/default shape so the page renders
 * "live but empty" rather than mock.
 */
@Injectable()
export class AdminConsoleService {
  constructor(private readonly prisma: PrismaService) {}

  private cap(limit?: number): number {
    return Math.min(Math.max(limit ?? 200, 1), 500);
  }

  /** /admin/users — every platform account + its primary membership role. */
  async listUsers(limit?: number) {
    const users = await this.prisma.user.findMany({
      take: this.cap(limit),
      orderBy: { createdAt: 'desc' },
      include: { memberships: { orderBy: { isPrimary: 'desc' }, take: 1 } },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      status: u.status,
      role: u.memberships[0]?.role ?? null,
      tenantId: u.memberships[0]?.tenantId ?? null,
      elderModeEnabled: u.elderModeEnabled,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    }));
  }

  /** /admin/devices — registered devices across all tenants. */
  listDevices(limit?: number) {
    return this.prisma.device.findMany({
      take: this.cap(limit),
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  /** /admin/live-sessions — active sessions first, then most recent. */
  listLiveSessions(limit?: number) {
    return this.prisma.session.findMany({
      take: this.cap(limit),
      orderBy: [{ status: 'asc' }, { startedAt: 'desc' }],
    });
  }

  /** /admin/audit-logs — most recent platform audit entries. */
  listAuditLogs(limit?: number) {
    return this.prisma.auditLog.findMany({
      take: this.cap(limit),
      orderBy: { createdAt: 'desc' },
    });
  }

  /** /admin/billing — real revenue rollup from tenant subscriptions + Stripe state. */
  async billingRevenue() {
    const subs = await this.prisma.tenantSubscription.findMany();
    const active = subs.filter((s) => s.status === 'ACTIVE');
    const counts = new Map<string, number>();
    for (const s of active) counts.set(s.plan, (counts.get(s.plan) ?? 0) + 1);

    const planDistribution = [...counts.entries()]
      .map(([plan, subscriptions]) => ({
        plan,
        label: PLAN_LABEL[plan] ?? plan,
        subscriptions,
        monthlyRevenue: Math.round((PLAN_PRICE[plan] ?? 0) * subscriptions * 100) / 100,
      }))
      .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);

    const mrr = planDistribution.reduce((sum, p) => sum + p.monthlyRevenue, 0);
    return {
      mrr: Math.round(mrr * 100) / 100,
      arr: Math.round(mrr * 12 * 100) / 100,
      activeSubscriptions: active.length,
      totalSubscriptions: subs.length,
      planDistribution,
    };
  }

  /** /admin/scam-corpus — the scam-category taxonomy (seed) + per-category registry counts. */
  async scamCorpus() {
    const [categories, registryByCategory] = await Promise.all([
      this.prisma.scamCategory.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.registryEntry.groupBy({ by: ['category'], _count: { _all: true } }),
    ]);
    const counts = new Map(registryByCategory.map((r) => [r.category, r._count._all]));
    return categories.map((c) => ({ ...c, registryEntries: counts.get(c.code) ?? 0 }));
  }

  /** /admin/script-genome — script-pattern nodes mined from ScamMirror / signals. */
  scriptGenome(limit?: number) {
    return this.prisma.fraudGraphNode.findMany({
      where: { nodeType: 'SCRIPT_PATTERN' },
      take: this.cap(limit),
      orderBy: [{ riskScore: 'desc' }, { signalCount: 'desc' }],
      select: {
        id: true,
        label: true,
        category: true,
        riskScore: true,
        signalCount: true,
        firstSeen: true,
        lastSeen: true,
      },
    });
  }

  /** /admin/compliance — no compliance-record model yet; stable empty shape. */
  compliance() {
    return {
      dataSubjectRequests: [],
      retentionPolicies: [],
      legalHolds: [],
      openCount: 0,
    };
  }

  /** /admin/support — no ticketing model yet; stable empty shape. */
  support() {
    return { tickets: [], openCount: 0, resolvedCount: 0 };
  }

  /** /admin/settings — platform-level operational flags (defaults until persisted). */
  settings() {
    return {
      maintenanceMode: false,
      signupsEnabled: true,
      aiEnabled: true,
      billingEnabled: true,
      defaultGuardianPauseSeconds: 30,
    };
  }
}
