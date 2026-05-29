import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, PublicAlert, PublicAlertSeverity, PublicAlertStatus } from '@prisma/client';
import { AuthenticatedUser, RequestContext } from '../../common/auth/auth.types';
import { CacheService } from '../../common/cache/cache.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { assertPublicSafeLanguage } from '../registry/safe-language';
import { WebhookService } from '../webhooks/webhook.service';
import { CreatePublicAlertDto } from './dto/create-public-alert.dto';
import { UpdatePublicAlertStatusDto } from './dto/update-public-alert-status.dto';
import { canTransition } from './public-alert.transitions';

const ALERTS_CACHE_PREFIX = 'public-alerts:';
const ALERTS_CACHE_TTL_MS = 60_000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Regional public alert system (PDF §43; closes Phase 7F). Alerts are public
 * statements about real scam infrastructure — title + body are vetted by the
 * same safe-language guard as registry summaries (docs/04 §2). Publication
 * fires a PUBLIC_ALERT_PUBLISHED webhook to every subscribed tenant.
 */
@Injectable()
export class PublicAlertService {
  private readonly logger = new Logger(PublicAlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly webhooks: WebhookService,
    private readonly cache: CacheService,
  ) {}

  // ─────────────── Admin authoring ───────────────

  async create(
    actor: AuthenticatedUser,
    dto: CreatePublicAlertDto,
    ctx: RequestContext = {},
  ): Promise<PublicAlert> {
    assertPublicSafeLanguage(dto.title, 'title');
    assertPublicSafeLanguage(dto.body, 'body');

    const alert = await this.prisma.publicAlert.create({
      data: {
        title: dto.title,
        body: dto.body,
        region: dto.region,
        severity: dto.severity ?? 'WARNING',
        category: dto.category,
        registryEntryIds: dto.registryEntryIds ?? [],
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        createdByUserId: actor.userId,
      },
    });
    await this.evidence.append({
      tenantId: null,
      actorId: actor.userId,
      actorType: this.actorTypeFor(actor),
      entityType: 'PUBLIC_ALERT',
      entityId: alert.id,
      eventType: 'PUBLIC_ALERT_CREATED',
      eventDescription: `Public alert drafted for ${alert.region}: "${alert.title}"`,
      metadata: { region: alert.region, severity: alert.severity, category: alert.category },
      ipAddress: ctx.ip ?? null,
    });
    return alert;
  }

  async updateStatus(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdatePublicAlertStatusDto,
    ctx: RequestContext = {},
  ): Promise<PublicAlert> {
    const current = await this.getInternal(id);
    if (!canTransition(current.status, dto.status)) {
      throw new BadRequestException(
        `Cannot move a public alert from ${current.status} to ${dto.status}`,
      );
    }
    const data: Prisma.PublicAlertUpdateInput = { status: dto.status };
    if (dto.status === 'PUBLISHED') {
      data.publishedByUserId = actor.userId;
      data.publishedAt = new Date();
    }
    if (dto.status === 'WITHDRAWN') {
      data.withdrawnAt = new Date();
    }
    if (dto.status === 'EXPIRED') {
      data.expiresAt = data.expiresAt ?? new Date();
    }
    const updated = await this.prisma.publicAlert.update({ where: { id }, data });

    await this.evidence.append({
      tenantId: null,
      actorId: actor.userId,
      actorType: this.actorTypeFor(actor),
      entityType: 'PUBLIC_ALERT',
      entityId: updated.id,
      eventType: `PUBLIC_ALERT_${dto.status}`,
      eventDescription: dto.reason ?? `Public alert moved to ${dto.status}`,
      metadata: {
        region: updated.region,
        severity: updated.severity,
        previousStatus: current.status,
      },
      ipAddress: ctx.ip ?? null,
    });

    // Invalidate the public read cache (mirror of 7A registry-search behavior).
    this.cache.deletePrefix(ALERTS_CACHE_PREFIX);

    // Broadcast a webhook to every subscribed tenant on publication.
    if (dto.status === 'PUBLISHED') {
      try {
        await this.webhooks.broadcastPublic('PUBLIC_ALERT_PUBLISHED', {
          alertId: updated.id,
          title: updated.title,
          body: updated.body,
          region: updated.region,
          severity: updated.severity,
          category: updated.category,
          registryEntryIds: updated.registryEntryIds,
          publishedAt: updated.publishedAt,
        });
      } catch (err) {
        this.logger.warn(`Public-alert webhook broadcast failed for ${updated.id}: ${String(err)}`);
      }
    }
    return updated;
  }

  listInternal(filters: { status?: string; region?: string } = {}) {
    const where: Prisma.PublicAlertWhereInput = {};
    if (filters.status && (Object.values(PublicAlertStatus) as string[]).includes(filters.status)) {
      where.status = filters.status as PublicAlertStatus;
    }
    if (filters.region) where.region = filters.region;
    return this.prisma.publicAlert.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  async getInternal(id: string): Promise<PublicAlert> {
    const alert = await this.prisma.publicAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Public alert not found');
    return alert;
  }

  // ─────────────── Public read ───────────────

  /**
   * Public listing: PUBLISHED alerts only, filterable by region + minimum
   * severity. Cached for 60 s with key invalidation on status changes.
   */
  async listPublic(
    filters: {
      region?: string;
      minSeverity?: string;
      limit?: number;
    } = {},
  ) {
    const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(filters.limit ?? DEFAULT_LIMIT)));
    const cacheKey = `${ALERTS_CACHE_PREFIX}r=${filters.region ?? ''}|s=${filters.minSeverity ?? ''}|l=${limit}`;
    const cached = this.cache.get<PublicAlert[]>(cacheKey);
    if (cached) return cached;

    const where: Prisma.PublicAlertWhereInput = { status: 'PUBLISHED' };
    if (filters.region) where.region = filters.region;
    if (
      filters.minSeverity &&
      (Object.values(PublicAlertSeverity) as string[]).includes(filters.minSeverity)
    ) {
      where.severity = this.severityAtOrAbove(filters.minSeverity as PublicAlertSeverity);
    }
    // Drop expired entries even if status hasn't yet been transitioned.
    const now = new Date();
    where.OR = [{ expiresAt: null }, { expiresAt: { gt: now } }];

    const rows = await this.prisma.publicAlert.findMany({
      where,
      orderBy: { publishedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        title: true,
        body: true,
        region: true,
        severity: true,
        category: true,
        publishedAt: true,
        expiresAt: true,
      },
    });
    this.cache.set(cacheKey, rows, ALERTS_CACHE_TTL_MS);
    return rows;
  }

  private severityAtOrAbove(minimum: PublicAlertSeverity): Prisma.EnumPublicAlertSeverityFilter {
    const ordered: PublicAlertSeverity[] = ['INFO', 'WARNING', 'CRITICAL'];
    const idx = ordered.indexOf(minimum);
    return { in: ordered.slice(idx) };
  }

  private actorTypeFor(actor: AuthenticatedUser): string {
    if (actor.role === 'SUPER_ADMIN' || actor.role === 'COMPLIANCE_OFFICER') return 'ADMIN';
    if (actor.role === 'REVIEWER') return 'REVIEWER';
    return 'STAFF';
  }
}
