import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  IndicatorType,
  Prisma,
  RegistryEntry,
  RegistryEntryStatus,
  WebhookEventType,
} from '@prisma/client';
import { AuthenticatedUser, RequestContext } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { normalizeIndicator } from '../scam-signals/normalization';
import { WebhookService } from '../webhooks/webhook.service';
import { CacheService } from '../../common/cache/cache.service';
import { TakedownAutomationService } from '../takedown/takedown-automation.service';
import { CreateRegistryCandidateDto } from './dto/create-registry-candidate.dto';
import { PublicRegistryEntry, toPublicRegistryEntry } from './registry.mapper';
import { assertPublicSafeLanguage } from './safe-language';

export interface RegistrySearchQuery {
  q?: string;
  type?: string;
  category?: string;
  page?: number;
  limit?: number;
}

export interface RegistrySearchResult {
  items: PublicRegistryEntry[];
  page: number;
  limit: number;
  hasMore: boolean;
}

/** Cap on page size — protects the cache and the public endpoint from abuse. */
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;
/** 60 s — short enough that a publish/unpublish becomes visible quickly,
 *  long enough to absorb the bulk of repeated public read traffic. */
const SEARCH_CACHE_TTL_MS = 60_000;
const SEARCH_CACHE_PREFIX = 'registry:search:';

/**
 * The Scam Intelligence Registry (PDF §26, §27). Governs the lifecycle that
 * turns verified intelligence into public-safe published entries:
 *   verified signal -> CANDIDATE -> APPROVED_PUBLIC_SAFE -> PUBLISHED
 * Publishing requires a prior public-safe approval — a CANDIDATE can never be
 * published directly. Every transition is written to the Evidence Vault.
 */
@Injectable()
export class RegistryService {
  private readonly logger = new Logger(RegistryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly webhooks: WebhookService,
    private readonly cache: CacheService,
    private readonly takedownAutomation: TakedownAutomationService,
  ) {}

  // ─────────────────── Public search (Phase 2D) ───────────────────

  async search(query: RegistrySearchQuery): Promise<RegistrySearchResult> {
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(query.limit ?? DEFAULT_PAGE_SIZE)),
    );

    // Cache key includes every dimension that changes the result.
    const cacheKey = this.buildCacheKey({ ...query, page, limit });
    const cached = this.cache.get<RegistrySearchResult>(cacheKey);
    if (cached) {
      return cached;
    }

    // PUBLISHED is the only publicly visible status — non-negotiable.
    const where: Prisma.RegistryEntryWhereInput = { status: 'PUBLISHED' };

    const type = this.parseType(query.type);
    if (type) {
      where.indicatorType = type;
    }
    if (query.category) {
      where.category = query.category.toUpperCase();
    }

    const q = query.q?.trim();
    if (q) {
      if (type) {
        where.normalizedIndicator = normalizeIndicator(type, q);
      } else {
        where.OR = [
          { normalizedIndicator: { contains: q.toLowerCase() } },
          { indicatorValue: { contains: q, mode: 'insensitive' } },
        ];
      }
    }

    // Fetch one extra row to know whether a next page exists, without a
    // separate count(*) — count is expensive at global scale.
    const rows = await this.prisma.registryEntry.findMany({
      where,
      orderBy: { lastSeen: 'desc' },
      skip: (page - 1) * limit,
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(toPublicRegistryEntry);
    const result: RegistrySearchResult = { items, page, limit, hasMore };

    this.cache.set(cacheKey, result, SEARCH_CACHE_TTL_MS);
    return result;
  }

  /** Invalidate every cached search response — call on publish/unpublish. */
  invalidateSearchCache(): number {
    return this.cache.deletePrefix(SEARCH_CACHE_PREFIX);
  }

  private buildCacheKey(q: RegistrySearchQuery & { page: number; limit: number }): string {
    return [
      SEARCH_CACHE_PREFIX,
      `q=${(q.q ?? '').trim().toLowerCase()}`,
      `t=${q.type ?? ''}`,
      `c=${q.category ?? ''}`,
      `p=${q.page}`,
      `l=${q.limit}`,
    ].join('|');
  }

  private parseType(raw?: string): IndicatorType | undefined {
    if (!raw) {
      return undefined;
    }
    const upper = raw.toUpperCase();
    return (Object.values(IndicatorType) as string[]).includes(upper)
      ? (upper as IndicatorType)
      : undefined;
  }

  // ─────────────────── Governance (Phase 3) ───────────────────

  /**
   * A reviewer turns a verified signal into a registry CANDIDATE. The public-
   * safe summary is reviewer-authored — raw report data is never copied across.
   */
  async createCandidate(
    reviewer: AuthenticatedUser,
    dto: CreateRegistryCandidateDto,
    ctx: RequestContext = {},
  ): Promise<RegistryEntry> {
    const signal = await this.prisma.scamSignal.findUnique({ where: { id: dto.signalId } });
    if (!signal) {
      throw new NotFoundException('Scam signal not found');
    }
    if (signal.status !== 'VERIFIED_SCAM_INTELLIGENCE') {
      throw new BadRequestException(
        'Only a signal promoted to verified intelligence can become a registry candidate',
      );
    }

    // Safe-language gate (PDF §38 #7/#8): reviewer-authored public text must
    // not contain direct identity accusations before it can be stored.
    assertPublicSafeLanguage(dto.publicSafeSummary, 'publicSafeSummary');
    if (dto.recommendedAction) {
      assertPublicSafeLanguage(dto.recommendedAction, 'recommendedAction');
    }

    const duplicate = await this.prisma.registryEntry.findFirst({
      where: { sourceSignalId: signal.id },
    });
    if (duplicate) {
      throw new ConflictException('A registry entry already exists for this signal');
    }

    const entry = await this.prisma.registryEntry.create({
      data: {
        indicatorType: signal.indicatorType,
        indicatorValue: signal.indicatorValue,
        normalizedIndicator: signal.normalizedIndicator,
        category: dto.category ?? signal.category ?? 'OTHER',
        status: 'CANDIDATE',
        publicStatus: dto.publicStatus,
        confidenceScore: signal.confidenceScore,
        publicSafeSummary: dto.publicSafeSummary,
        recommendedAction: dto.recommendedAction,
        firstSeen: signal.firstSeen,
        lastSeen: signal.lastSeen,
        evidenceCount: signal.reportCount,
        sourceSignalId: signal.id,
      },
    });

    // Queue the candidate for public-safe review.
    await this.prisma.registryReviewQueue.create({
      data: { registryEntryId: entry.id, reviewStatus: 'PENDING' },
    });

    await this.logEvidence(
      entry,
      reviewer,
      'REVIEWER',
      'REGISTRY_CANDIDATE_CREATED',
      'Registry candidate created from a verified signal',
      ctx,
    );
    return entry;
  }

  listInternal(status?: string): Promise<RegistryEntry[]> {
    const valid = (Object.values(RegistryEntryStatus) as string[]).includes(status ?? '');
    return this.prisma.registryEntry.findMany({
      where: valid ? { status: status as RegistryEntryStatus } : {},
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  async getInternal(id: string): Promise<RegistryEntry> {
    const entry = await this.prisma.registryEntry.findUnique({ where: { id } });
    if (!entry) {
      throw new NotFoundException('Registry entry not found');
    }
    return entry;
  }

  /** Public-safe review approval (CANDIDATE -> APPROVED_PUBLIC_SAFE). */
  async approve(
    admin: AuthenticatedUser,
    id: string,
    ctx: RequestContext = {},
  ): Promise<RegistryEntry> {
    await this.requireStatus(id, ['CANDIDATE', 'UNDER_REVIEW']);
    const updated = await this.prisma.registryEntry.update({
      where: { id },
      data: {
        status: 'APPROVED_PUBLIC_SAFE',
        approvedByUserId: admin.userId,
        approvedAt: new Date(),
      },
    });
    await this.markQueueComplete(id, admin, 'APPROVED');
    await this.logEvidence(
      updated,
      admin,
      'ADMIN',
      'REGISTRY_APPROVED',
      'Registry entry passed public-safe review',
      ctx,
    );
    return updated;
  }

  /** Publish an approved entry — it becomes publicly searchable. */
  async publish(
    admin: AuthenticatedUser,
    id: string,
    ctx: RequestContext = {},
  ): Promise<RegistryEntry> {
    await this.requireStatus(id, ['APPROVED_PUBLIC_SAFE']);
    const updated = await this.prisma.registryEntry.update({
      where: { id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    await this.logEvidence(
      updated,
      admin,
      'ADMIN',
      'REGISTRY_PUBLISHED',
      'Registry entry published to the public registry',
      ctx,
    );
    this.invalidateSearchCache();
    await this.notifyPartner(updated, 'REGISTRY_PUBLISHED');

    // Auto-draft a takedown request based on OSINT data + provider templates
    // (Phase 7D). Best-effort — never breaks publish.
    try {
      await this.takedownAutomation.tryAutomate(updated);
    } catch (err) {
      this.logger.warn(`Takedown automation failed for entry ${updated.id}: ${String(err)}`);
    }
    return updated;
  }

  /** Remove a published entry from the public registry. */
  async unpublish(
    admin: AuthenticatedUser,
    id: string,
    ctx: RequestContext = {},
  ): Promise<RegistryEntry> {
    await this.requireStatus(id, ['PUBLISHED']);
    const updated = await this.prisma.registryEntry.update({
      where: { id },
      data: { status: 'APPROVED_PUBLIC_SAFE', publishedAt: null },
    });
    await this.logEvidence(
      updated,
      admin,
      'ADMIN',
      'REGISTRY_UNPUBLISHED',
      'Registry entry removed from the public registry',
      ctx,
    );
    this.invalidateSearchCache();
    await this.notifyPartner(updated, 'REGISTRY_UNPUBLISHED');
    return updated;
  }

  /**
   * Notify the partner tenant whose signal seeded this registry entry that
   * its publication state has changed (Phase 5D). Best-effort — a webhook
   * failure must never break the publish/unpublish action.
   */
  private async notifyPartner(entry: RegistryEntry, eventType: WebhookEventType): Promise<void> {
    if (!entry.sourceSignalId) {
      return;
    }
    try {
      const source = await this.prisma.scamSignal.findUnique({
        where: { id: entry.sourceSignalId },
      });
      if (!source?.tenantId) {
        return;
      }
      await this.webhooks.publish(eventType, source.tenantId, {
        registryEntryId: entry.id,
        indicatorType: entry.indicatorType,
        indicatorValue: entry.indicatorValue,
        publicStatus: entry.publicStatus,
        publishedAt: entry.publishedAt,
      });
    } catch (err) {
      this.logger.warn(`Webhook publish failed for registry entry ${entry.id}: ${String(err)}`);
    }
  }

  async reject(
    admin: AuthenticatedUser,
    id: string,
    ctx: RequestContext = {},
  ): Promise<RegistryEntry> {
    await this.requireStatus(id, ['CANDIDATE', 'UNDER_REVIEW', 'APPROVED_PUBLIC_SAFE']);
    const updated = await this.prisma.registryEntry.update({
      where: { id },
      data: { status: 'REJECTED' },
    });
    await this.markQueueComplete(id, admin, 'REJECTED');
    await this.logEvidence(
      updated,
      admin,
      'ADMIN',
      'REGISTRY_REJECTED',
      'Registry entry rejected',
      ctx,
    );
    return updated;
  }

  private async requireStatus(id: string, allowed: RegistryEntryStatus[]): Promise<RegistryEntry> {
    const entry = await this.prisma.registryEntry.findUnique({ where: { id } });
    if (!entry) {
      throw new NotFoundException('Registry entry not found');
    }
    if (!allowed.includes(entry.status)) {
      throw new BadRequestException(
        `Registry entry status is ${entry.status}; this action requires ${allowed.join(' or ')}`,
      );
    }
    return entry;
  }

  private async markQueueComplete(
    registryEntryId: string,
    actor: AuthenticatedUser,
    decision: string,
  ): Promise<void> {
    await this.prisma.registryReviewQueue.updateMany({
      where: { registryEntryId, reviewStatus: { not: 'COMPLETED' } },
      data: { reviewStatus: 'COMPLETED', assignedToUserId: actor.userId, decision },
    });
  }

  private logEvidence(
    entry: RegistryEntry,
    actor: AuthenticatedUser,
    actorType: string,
    eventType: string,
    description: string,
    ctx: RequestContext,
  ): Promise<unknown> {
    return this.evidence.append({
      tenantId: null,
      actorId: actor.userId,
      actorType,
      entityType: 'REGISTRY_ENTRY',
      entityId: entry.id,
      eventType,
      eventDescription: description,
      metadata: { status: entry.status, indicatorType: entry.indicatorType },
      ipAddress: ctx.ip ?? null,
    });
  }
}
