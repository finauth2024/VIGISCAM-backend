import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { CreateIntegrationDto, IntegrationStatus } from './dto/create-integration.dto';
import { ListDevicesQueryDto } from './dto/list-devices-query.dto';
import { SetPolicyDto } from './dto/set-policy.dto';
import {
  EnterprisePolicyKey,
  isKnownPolicyKey,
  KNOWN_POLICY_KEYS,
  POLICY_REGISTRY,
} from './policy-registry';

@Injectable()
export class EnterprisePortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly billing: BillingService,
  ) {}

  // ─── Policies ──────────────────────────────────────────────────────────────

  listPolicyDefinitions() {
    return KNOWN_POLICY_KEYS.map((k) => ({
      key: k,
      description: POLICY_REGISTRY[k].description,
    }));
  }

  listPolicies(user: AuthenticatedUser) {
    return this.prisma.enterprisePolicy.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { key: 'asc' },
    });
  }

  async getPolicy(user: AuthenticatedUser, key: string) {
    if (!isKnownPolicyKey(key)) {
      throw new BadRequestException(`Unknown policy key "${key}"`);
    }
    const row = await this.prisma.enterprisePolicy.findUnique({
      where: { tenantId_key: { tenantId: user.tenantId, key } },
    });
    if (!row) throw new NotFoundException('Policy not set for this tenant');
    return row;
  }

  async setPolicy(user: AuthenticatedUser, key: string, dto: SetPolicyDto) {
    if (!isKnownPolicyKey(key)) {
      throw new BadRequestException(`Unknown policy key "${key}"`);
    }
    const validatorError = POLICY_REGISTRY[key as EnterprisePolicyKey].validate(dto.value);
    if (validatorError) {
      throw new BadRequestException(`Invalid value for "${key}": ${validatorError}`);
    }

    const row = await this.prisma.enterprisePolicy.upsert({
      where: { tenantId_key: { tenantId: user.tenantId, key } },
      create: {
        tenantId: user.tenantId,
        key,
        value: dto.value as never,
        updatedByUserId: user.userId,
      },
      update: {
        value: dto.value as never,
        updatedByUserId: user.userId,
      },
    });

    const evidenceEvent = await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'ENTERPRISE_POLICY',
      entityId: row.id,
      eventType: 'ENTERPRISE_POLICY_SET',
      eventDescription: `Policy "${key}" updated`,
      metadata: { key, value: dto.value as never },
    });

    return this.prisma.enterprisePolicy.update({
      where: { id: row.id },
      data: { evidenceEventId: evidenceEvent.id },
    });
  }

  async deletePolicy(user: AuthenticatedUser, key: string) {
    if (!isKnownPolicyKey(key)) {
      throw new BadRequestException(`Unknown policy key "${key}"`);
    }
    const row = await this.prisma.enterprisePolicy.findUnique({
      where: { tenantId_key: { tenantId: user.tenantId, key } },
    });
    if (!row) throw new NotFoundException('Policy not set for this tenant');
    await this.prisma.enterprisePolicy.delete({ where: { id: row.id } });
    await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'ENTERPRISE_POLICY',
      entityId: row.id,
      eventType: 'ENTERPRISE_POLICY_DELETED',
      eventDescription: `Policy "${key}" cleared`,
      metadata: { key },
    });
  }

  // ─── Device fleet (read-only) ──────────────────────────────────────────────

  listDevices(user: AuthenticatedUser, query: ListDevicesQueryDto) {
    return this.prisma.device.findMany({
      where: {
        tenantId: user.tenantId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.userId ? { userId: query.userId } : {}),
      },
      orderBy: { lastSeenAt: 'desc' },
      take: query.limit ?? 100,
      select: {
        id: true,
        userId: true,
        name: true,
        type: true,
        platform: true,
        status: true,
        trusted: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
  }

  // ─── Integrations ──────────────────────────────────────────────────────────

  listIntegrations(user: AuthenticatedUser) {
    return this.prisma.enterpriseIntegration.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createIntegration(user: AuthenticatedUser, dto: CreateIntegrationDto) {
    const row = await this.prisma.enterpriseIntegration.create({
      data: {
        tenantId: user.tenantId,
        kind: dto.kind,
        name: dto.name,
        config: dto.config as never,
        status: dto.status ?? IntegrationStatus.ACTIVE,
        createdByUserId: user.userId,
      },
    });
    const evidenceEvent = await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'ENTERPRISE_INTEGRATION',
      entityId: row.id,
      eventType: 'ENTERPRISE_INTEGRATION_CREATED',
      eventDescription: `${dto.kind} integration "${dto.name}" created`,
      metadata: { kind: dto.kind, name: dto.name, status: row.status },
    });
    return this.prisma.enterpriseIntegration.update({
      where: { id: row.id },
      data: { evidenceEventId: evidenceEvent.id },
    });
  }

  async deleteIntegration(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.enterpriseIntegration.findUnique({ where: { id } });
    if (!row || row.tenantId !== user.tenantId) {
      throw new NotFoundException('Integration not found');
    }
    await this.prisma.enterpriseIntegration.delete({ where: { id } });
    await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'ENTERPRISE_INTEGRATION',
      entityId: id,
      eventType: 'ENTERPRISE_INTEGRATION_DELETED',
      eventDescription: `Integration "${row.name}" deleted`,
      metadata: { kind: row.kind, name: row.name },
    });
  }

  // ─── Audit log (read-only alias of the evidence timeline) ──────────────────

  auditLog(user: AuthenticatedUser, query: AuditLogQueryDto) {
    return this.evidence.getTimeline(user.tenantId, {
      entityType: query.entityType,
      entityId: query.entityId,
      limit: query.limit,
    });
  }

  // ─── Billing surface (Phase 11A — live subscription) ───────────────────────

  async billingSummary(user: AuthenticatedUser) {
    const sub = await this.billing.getSubscription(user.tenantId);
    return {
      provider: 'STRIPE',
      providerActive: sub.stripeConfigured,
      plan: sub.plan,
      status: sub.status,
      manualInvoice: sub.manualInvoice,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      // The portal URL is minted on demand via POST /billing/portal — it is
      // a short-lived signed Stripe URL, never persisted here.
      manageVia: 'POST /api/v1/billing/portal',
    };
  }
}
