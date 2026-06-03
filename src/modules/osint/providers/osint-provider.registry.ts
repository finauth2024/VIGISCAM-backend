import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IndicatorType } from '@prisma/client';
import { OsintProvider, OsintProviderInput, ProviderLookupResult } from './osint-provider';
import { buildOsintProviders } from './osint-providers';

export interface ProviderRun {
  provider: OsintProvider;
  result: ProviderLookupResult;
}

/**
 * CP-6 — holds the OSINT provider catalog and fans an indicator out to every
 * applicable provider. Privacy: only the indicator type + normalized value are
 * passed to providers; never PII. Providers never throw (failures degrade to an
 * empty result), so enrichment stays best-effort.
 */
@Injectable()
export class OsintProviderRegistry {
  private readonly providers: OsintProvider[];

  constructor(config: ConfigService) {
    this.providers = buildOsintProviders(config);
  }

  /** Catalog for the admin endpoint — what's available + which feeds are live. */
  catalog(): Array<{ name: string; category: string; live: boolean }> {
    return this.providers.map((p) => ({ name: p.name, category: p.category, live: p.isLive() }));
  }

  providersFor(indicatorType: IndicatorType): OsintProvider[] {
    return this.providers.filter((p) => p.supports(indicatorType));
  }

  /** Run every applicable provider for the indicator. */
  async enrich(input: OsintProviderInput): Promise<ProviderRun[]> {
    const safeInput: OsintProviderInput = {
      indicatorType: input.indicatorType,
      normalizedIndicator: input.normalizedIndicator,
    };
    return Promise.all(
      this.providersFor(input.indicatorType).map(async (provider) => ({
        provider,
        result: await provider
          .lookup(safeInput)
          .catch(() => ({ data: { provider: provider.name, error: true }, riskHints: [] })),
      })),
    );
  }
}
