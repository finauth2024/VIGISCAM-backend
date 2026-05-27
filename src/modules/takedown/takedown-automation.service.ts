import { Injectable, Logger } from '@nestjs/common';
import {
  IndicatorType,
  RegistryEntry,
  TakedownProviderTemplate,
  TakedownProviderType,
  TakedownRequest,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';

/** Which TakedownProviderType to look for given an indicator type. */
const TYPE_TO_PROVIDER: Partial<Record<IndicatorType, TakedownProviderType>> = {
  DOMAIN: TakedownProviderType.DOMAIN_REGISTRAR,
  URL: TakedownProviderType.DOMAIN_REGISTRAR,
  EMAIL: TakedownProviderType.EMAIL_PROVIDER,
  PHONE: TakedownProviderType.TELECOM_CARRIER,
  CRYPTO_WALLET: TakedownProviderType.PAYMENT_PROVIDER,
  SOCIAL_PROFILE: TakedownProviderType.SOCIAL_PLATFORM,
};

export interface AutomateResult {
  matched: number;
  created: number;
  takedownIds: string[];
}

/**
 * Advanced takedown automation (PDF §43, docs/02 Phase 7D). When a registry
 * entry is published, this service looks up matching enabled provider
 * templates from the latest OSINT enrichment for the indicator and auto-
 * drafts a TakedownRequest. Always lands as DRAFT — the human-in-the-loop
 * guardrail mirrors detection-rule activation (4B): no automated action
 * leaves VIGISCAM without an admin review.
 *
 * Idempotent: a takedown already targeting (registryEntryId, providerName)
 * is never duplicated.
 */
@Injectable()
export class TakedownAutomationService {
  private readonly logger = new Logger(TakedownAutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
  ) {}

  async tryAutomate(entry: RegistryEntry): Promise<AutomateResult> {
    const providerType = TYPE_TO_PROVIDER[entry.indicatorType];
    if (!providerType) {
      return { matched: 0, created: 0, takedownIds: [] };
    }

    // Latest OSINT enrichment for this indicator — produces the detected name.
    const osint = await this.prisma.osintEnrichment.findFirst({
      where: {
        indicatorType: entry.indicatorType,
        normalizedIndicator: entry.normalizedIndicator,
      },
      orderBy: { createdAt: 'desc' },
    });
    const detectedName = this.extractDetectedName(osint?.data, providerType);
    if (!detectedName) {
      return { matched: 0, created: 0, takedownIds: [] };
    }

    const candidates = await this.prisma.takedownProviderTemplate.findMany({
      where: { enabled: true, providerType },
      orderBy: { priority: 'desc' },
    });

    const matched = candidates.filter((t) => this.matches(t.detectorPattern, detectedName));
    if (matched.length === 0) {
      return { matched: 0, created: 0, takedownIds: [] };
    }

    // Only act on the highest-priority match to avoid spamming providers.
    const template = matched[0];

    // Idempotency — don't duplicate an existing takedown for the same pair.
    const existing = await this.prisma.takedownRequest.findFirst({
      where: { registryEntryId: entry.id, providerName: template.providerName },
    });
    if (existing) {
      return { matched: matched.length, created: 0, takedownIds: [] };
    }

    const details = this.renderTemplate(template.detailsTemplate, entry);
    const takedown = await this.prisma.takedownRequest.create({
      data: {
        registryEntryId: entry.id,
        providerType: template.providerType,
        providerName: template.providerName,
        details,
        status: 'DRAFT',
      },
    });

    await this.evidence.append({
      tenantId: null,
      actorType: 'SYSTEM',
      entityType: 'TAKEDOWN_REQUEST',
      entityId: takedown.id,
      eventType: 'TAKEDOWN_AUTO_DRAFTED',
      eventDescription: `Auto-drafted takedown to ${template.providerName} (${detectedName})`,
      metadata: {
        registryEntryId: entry.id,
        templateId: template.id,
        providerType: template.providerType,
        providerName: template.providerName,
        detectedName,
      },
    });

    return { matched: matched.length, created: 1, takedownIds: [takedown.id] };
  }

  // ─────────────── Template management ───────────────

  listTemplates(filters: { providerType?: string; enabled?: boolean } = {}) {
    return this.prisma.takedownProviderTemplate.findMany({
      where: {
        ...(filters.providerType &&
        (Object.values(TakedownProviderType) as string[]).includes(filters.providerType)
          ? { providerType: filters.providerType as TakedownProviderType }
          : {}),
        ...(filters.enabled !== undefined ? { enabled: filters.enabled } : {}),
      },
      orderBy: [{ providerType: 'asc' }, { priority: 'desc' }, { providerName: 'asc' }],
      take: 500,
    });
  }

  createTemplate(input: Omit<TakedownProviderTemplate, 'id' | 'createdAt' | 'updatedAt'>) {
    return this.prisma.takedownProviderTemplate.create({ data: input });
  }

  // ─────────────── Helpers ───────────────

  /** OSINT puts the registrar name under `data.registrar` for DOMAIN/URL stubs. */
  private extractDetectedName(
    data: unknown,
    providerType: TakedownProviderType,
  ): string | null {
    if (!data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    if (providerType === TakedownProviderType.DOMAIN_REGISTRAR) {
      return typeof d.registrar === 'string' ? d.registrar : null;
    }
    // Future enhancements can extract from other OSINT fields per provider type.
    return null;
  }

  private matches(pattern: string, value: string): boolean {
    try {
      // JavaScript's RegExp doesn't support the PCRE inline flag `(?i)` —
      // strip it if present and always run case-insensitive. This keeps
      // existing seeded templates ("(?i)godaddy") working without a data
      // migration.
      const cleaned = pattern.replace(/^\(\?i\)/, '');
      return new RegExp(cleaned, 'i').test(value);
    } catch (err) {
      this.logger.warn(`Invalid template regex "${pattern}": ${String(err)}`);
      return false;
    }
  }

  private renderTemplate(template: string, entry: RegistryEntry): string {
    return template
      .replace(/\{indicator\}/g, entry.indicatorValue)
      .replace(/\{category\}/g, entry.category)
      .replace(/\{summary\}/g, entry.publicSafeSummary);
  }
}
