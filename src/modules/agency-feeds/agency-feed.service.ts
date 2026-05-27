import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AgencyFeed, IndicatorType, Prisma, TenantType } from '@prisma/client';
import { AuthenticatedUser, RequestContext } from '../../common/auth/auth.types';
import { PartnerPrincipal } from '../../common/auth/partner.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { CreateAgencyFeedDto } from './dto/create-agency-feed.dto';

/** Tenants that may own an agency feed. */
const ELIGIBLE_TENANT_TYPES: TenantType[] = [
  TenantType.AGENCY,
  TenantType.INVESTIGATOR,
  TenantType.INTERNAL,
];

/** Per-call cap on items the feed can return — protects the database. */
const MAX_FEED_ITEMS = 200;
const DEFAULT_FEED_ITEMS = 50;

export interface FeedConsumeResult {
  items: ReturnType<AgencyFeedService['projectEntry']>[];
  count: number;
  untilCursor: string;
  sinceCursor: string | null;
  hasMore: boolean;
}

/**
 * Cross-border agency feeds (PDF §43 "cross-border agency feeds", docs/02
 * Phase 7; closes at LR-4). Reviewer/admin issues a feed for an agency
 * tenant; the agency consumes via partner API key + AGENCY_FEED scope.
 * Every consume writes an AgencyFeedDelivery for the chain-of-custody audit
 * cross-border data-sharing agreements require.
 */
@Injectable()
export class AgencyFeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
  ) {}

  // ─────────────── Admin management ───────────────

  async createFeed(
    actor: AuthenticatedUser,
    dto: CreateAgencyFeedDto,
    ctx: RequestContext = {},
  ): Promise<AgencyFeed> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (!ELIGIBLE_TENANT_TYPES.includes(tenant.type)) {
      throw new BadRequestException(
        `Tenant type ${tenant.type} cannot own an agency feed (only AGENCY / INVESTIGATOR / INTERNAL).`,
      );
    }

    const feed = await this.prisma.agencyFeed.create({
      data: {
        tenantId: dto.tenantId,
        name: dto.name,
        region: dto.region,
        categories: dto.categories ?? [],
        indicatorTypes: dto.indicatorTypes ?? [],
        createdByUserId: actor.userId,
      },
    });

    await this.evidence.append({
      tenantId: tenant.id,
      actorId: actor.userId,
      actorType: 'ADMIN',
      entityType: 'AGENCY_FEED',
      entityId: feed.id,
      eventType: 'AGENCY_FEED_CREATED',
      eventDescription: `Cross-border agency feed "${dto.name}" issued to ${tenant.name}`,
      metadata: {
        region: dto.region ?? null,
        categories: dto.categories ?? [],
        indicatorTypes: dto.indicatorTypes ?? [],
      },
      ipAddress: ctx.ip ?? null,
    });

    return feed;
  }

  listFeeds(tenantId?: string) {
    return this.prisma.agencyFeed.findMany({
      where: tenantId ? { tenantId } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async getFeed(id: string): Promise<AgencyFeed> {
    const feed = await this.prisma.agencyFeed.findUnique({ where: { id } });
    if (!feed) throw new NotFoundException('Agency feed not found');
    return feed;
  }

  async revokeFeed(
    actor: AuthenticatedUser,
    id: string,
    ctx: RequestContext = {},
  ): Promise<AgencyFeed> {
    const feed = await this.getFeed(id);
    if (feed.status === 'REVOKED') return feed;
    const updated = await this.prisma.agencyFeed.update({
      where: { id },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    await this.evidence.append({
      tenantId: feed.tenantId,
      actorId: actor.userId,
      actorType: 'ADMIN',
      entityType: 'AGENCY_FEED',
      entityId: feed.id,
      eventType: 'AGENCY_FEED_REVOKED',
      eventDescription: `Agency feed "${feed.name}" revoked`,
      metadata: { tenantId: feed.tenantId },
      ipAddress: ctx.ip ?? null,
    });
    return updated;
  }

  // ─────────────── Partner consumption ───────────────

  /**
   * Consume a feed as the agency partner. Tenant-scoped — the partner key's
   * tenant MUST match the feed's tenant. Returns PUBLISHED registry entries
   * matching the feed's filters, since the optional cursor.
   */
  async consumeFeed(
    partner: PartnerPrincipal,
    feedId: string,
    sinceIso?: string,
    requestedLimit?: number,
  ): Promise<FeedConsumeResult> {
    const feed = await this.prisma.agencyFeed.findUnique({ where: { id: feedId } });
    if (!feed) throw new NotFoundException('Agency feed not found');
    if (feed.tenantId !== partner.tenantId) {
      // Defensive: return a 404, not a 403, so the existence of feeds for
      // other tenants is not confirmed.
      throw new NotFoundException('Agency feed not found');
    }
    if (feed.status !== 'ACTIVE') {
      throw new ForbiddenException(`Feed is ${feed.status.toLowerCase()}`);
    }

    const limit = Math.min(
      MAX_FEED_ITEMS,
      Math.max(1, Math.floor(requestedLimit ?? DEFAULT_FEED_ITEMS)),
    );

    const since = sinceIso ? new Date(sinceIso) : null;
    const now = new Date();

    const where: Prisma.RegistryEntryWhereInput = {
      status: 'PUBLISHED',
    };
    if (feed.categories.length > 0) {
      where.category = { in: feed.categories };
    }
    if (feed.indicatorTypes.length > 0) {
      where.indicatorType = { in: feed.indicatorTypes as IndicatorType[] };
    }
    if (since) {
      where.updatedAt = { gt: since, lte: now };
    } else {
      where.updatedAt = { lte: now };
    }

    const rows = await this.prisma.registryEntry.findMany({
      where,
      orderBy: { updatedAt: 'asc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => this.projectEntry(r));

    // Audit the consume (chain of custody, docs/04 LR-4).
    await this.prisma.agencyFeedDelivery.create({
      data: {
        feedId: feed.id,
        tenantId: feed.tenantId,
        requestedByKeyId: partner.keyId,
        itemCount: items.length,
        sinceCursor: since,
        untilCursor: now,
      },
    });
    await this.prisma.agencyFeed.update({
      where: { id: feed.id },
      data: { lastDeliveredAt: now },
    });

    return {
      items,
      count: items.length,
      sinceCursor: since ? since.toISOString() : null,
      untilCursor: now.toISOString(),
      hasMore,
    };
  }

  /** Public-safe projection — what the agency actually receives per entry. */
  projectEntry(entry: {
    id: string;
    indicatorType: IndicatorType;
    indicatorValue: string;
    category: string;
    publicStatus: string | null;
    publicSafeSummary: string;
    recommendedAction: string | null;
    firstSeen: Date | null;
    lastSeen: Date | null;
    publishedAt: Date | null;
    updatedAt: Date;
  }) {
    return {
      id: entry.id,
      indicatorType: entry.indicatorType,
      indicator: entry.indicatorValue,
      category: entry.category,
      publicStatus: entry.publicStatus,
      summary: entry.publicSafeSummary,
      recommendedAction: entry.recommendedAction,
      firstSeen: entry.firstSeen,
      lastSeen: entry.lastSeen,
      publishedAt: entry.publishedAt,
      updatedAt: entry.updatedAt,
    };
  }
}
