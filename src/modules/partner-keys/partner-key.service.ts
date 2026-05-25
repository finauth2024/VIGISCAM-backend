import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PartnerApiKey, TenantType } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { AuthenticatedUser, RequestContext } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { CreatePartnerKeyDto } from './dto/create-partner-key.dto';

/** Tenants that may hold partner API keys (PDF §8 tenant types). */
const ELIGIBLE_TENANT_TYPES: TenantType[] = [
  TenantType.BANK,
  TenantType.PLATFORM,
  TenantType.INVESTIGATOR,
  TenantType.AGENCY,
  TenantType.ENTERPRISE,
  TenantType.INTERNAL,
];

export interface IssuedPartnerKey {
  /** The raw key — shown exactly ONCE. The caller MUST capture it now. */
  rawKey: string;
  record: PartnerApiKey;
}

/**
 * Partner API-key management (PDF §39 enterprise API keys). The raw key is
 * generated server-side, hashed (SHA-256) for storage, and returned a single
 * time. Personal/family/public tenants cannot hold partner keys.
 */
@Injectable()
export class PartnerKeyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
  ) {}

  /** Issue a new key for a partner tenant. */
  async issueKey(
    actor: AuthenticatedUser,
    dto: CreatePartnerKeyDto,
    ctx: RequestContext = {},
  ): Promise<IssuedPartnerKey> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    if (!ELIGIBLE_TENANT_TYPES.includes(tenant.type)) {
      throw new BadRequestException(
        `Tenant type ${tenant.type} cannot hold a partner API key — partner keys are only for institutional tenants (BANK, PLATFORM, INVESTIGATOR, AGENCY, ENTERPRISE, INTERNAL).`,
      );
    }

    const { raw, hash, prefix } = this.generateRawKey();
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    const record = await this.prisma.partnerApiKey.create({
      data: {
        tenantId: dto.tenantId,
        keyHash: hash,
        keyPrefix: prefix,
        label: dto.label,
        scopes: dto.scopes,
        expiresAt,
        createdByUserId: actor.userId,
      },
    });

    await this.evidence.append({
      tenantId: tenant.id,
      actorId: actor.userId,
      actorType: 'ADMIN',
      entityType: 'PARTNER_API_KEY',
      entityId: record.id,
      eventType: 'PARTNER_KEY_ISSUED',
      eventDescription: `Partner API key issued (${prefix}…) to ${tenant.name}`,
      metadata: { tenantId: tenant.id, scopes: record.scopes, keyPrefix: prefix },
      ipAddress: ctx.ip ?? null,
    });

    return { rawKey: raw, record };
  }

  /** List keys, optionally scoped to one tenant. Hashes are never returned. */
  listKeys(tenantId?: string): Promise<PartnerApiKey[]> {
    return this.prisma.partnerApiKey.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** Revoke a key. Idempotent — revoking an already-revoked key is a no-op. */
  async revokeKey(
    actor: AuthenticatedUser,
    id: string,
    ctx: RequestContext = {},
  ): Promise<PartnerApiKey> {
    const key = await this.prisma.partnerApiKey.findUnique({ where: { id } });
    if (!key) {
      throw new NotFoundException('Partner API key not found');
    }
    if (key.status === 'REVOKED') {
      return key;
    }
    const updated = await this.prisma.partnerApiKey.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    await this.evidence.append({
      tenantId: key.tenantId,
      actorId: actor.userId,
      actorType: 'ADMIN',
      entityType: 'PARTNER_API_KEY',
      entityId: key.id,
      eventType: 'PARTNER_KEY_REVOKED',
      eventDescription: `Partner API key revoked (${key.keyPrefix}…)`,
      metadata: { tenantId: key.tenantId, keyPrefix: key.keyPrefix },
      ipAddress: ctx.ip ?? null,
    });
    return updated;
  }

  /**
   * Generate a fresh raw key + its SHA-256 hash + a short display prefix.
   * Format: `vsk_<40 hex chars>` — 160 bits of entropy.
   */
  private generateRawKey(): { raw: string; hash: string; prefix: string } {
    const random = randomBytes(20).toString('hex');
    const raw = `vsk_${random}`;
    const hash = createHash('sha256').update(raw).digest('hex');
    const prefix = raw.slice(0, 10);
    return { raw, hash, prefix };
  }
}
