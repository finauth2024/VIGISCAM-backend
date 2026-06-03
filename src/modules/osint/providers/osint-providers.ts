import { ConfigService } from '@nestjs/config';
import { IndicatorType } from '@prisma/client';
import {
  OsintProvider,
  OsintProviderCategory,
  OsintProviderInput,
  ProviderLookupResult,
} from './osint-provider';

interface ProviderSpec {
  name: string;
  category: OsintProviderCategory;
  types: IndicatorType[];
  /** Env var that, when set, marks the real integration as live. */
  envKey: string;
}

/**
 * The provider catalog. Each entry is a real external OSINT feed that drops in
 * behind the OsintProvider interface once its API key is configured. Until then
 * the provider is "not configured" and returns an empty (honest) result — the
 * structural checks in osint-stub still run regardless.
 */
const SPECS: ProviderSpec[] = [
  { name: 'whois', category: 'WHOIS', types: ['DOMAIN', 'URL'], envKey: 'OSINT_WHOIS_API_KEY' },
  { name: 'passive-dns', category: 'PASSIVE_DNS', types: ['DOMAIN', 'URL'], envKey: 'OSINT_PASSIVE_DNS_API_KEY' },
  { name: 'cert-transparency', category: 'CERT_TRANSPARENCY', types: ['DOMAIN', 'URL'], envKey: 'OSINT_CERT_TRANSPARENCY_API_KEY' },
  { name: 'domain-reputation', category: 'DOMAIN_REPUTATION', types: ['DOMAIN', 'URL'], envKey: 'OSINT_DOMAIN_REPUTATION_API_KEY' },
  { name: 'url-reputation', category: 'URL_REPUTATION', types: ['URL'], envKey: 'OSINT_URL_REPUTATION_API_KEY' },
  { name: 'phone-reputation', category: 'PHONE_REPUTATION', types: ['PHONE'], envKey: 'OSINT_PHONE_REPUTATION_API_KEY' },
  { name: 'email-reputation', category: 'EMAIL_REPUTATION', types: ['EMAIL'], envKey: 'OSINT_EMAIL_REPUTATION_API_KEY' },
  { name: 'wallet-reputation', category: 'WALLET_REPUTATION', types: ['CRYPTO_WALLET'], envKey: 'OSINT_WALLET_REPUTATION_API_KEY' },
  { name: 'blockchain-explorer', category: 'BLOCKCHAIN_EXPLORER', types: ['CRYPTO_WALLET'], envKey: 'OSINT_BLOCKCHAIN_EXPLORER_API_KEY' },
  {
    name: 'takedown-history',
    category: 'TAKEDOWN_HISTORY',
    types: ['DOMAIN', 'URL', 'EMAIL', 'PHONE', 'CRYPTO_WALLET'],
    envKey: 'OSINT_TAKEDOWN_HISTORY_API_KEY',
  },
  {
    name: 'public-advisory',
    category: 'PUBLIC_ADVISORY',
    types: ['DOMAIN', 'URL', 'EMAIL', 'PHONE', 'CRYPTO_WALLET'],
    envKey: 'OSINT_PUBLIC_ADVISORY_API_KEY',
  },
];

/** An env-gated provider. Real lookup is wired in when the key is configured. */
class ConfigGatedProvider implements OsintProvider {
  constructor(
    readonly name: string,
    readonly category: OsintProviderCategory,
    private readonly types: IndicatorType[],
    private readonly configured: boolean,
  ) {}

  supports(indicatorType: IndicatorType): boolean {
    return this.types.includes(indicatorType);
  }

  isLive(): boolean {
    return this.configured;
  }

  async lookup(_input: OsintProviderInput): Promise<ProviderLookupResult> {
    // When configured, the real provider client is called here. Until then we
    // return an honest "not configured" result rather than fabricating data.
    if (!this.configured) {
      return { data: { provider: this.name, configured: false }, riskHints: [] };
    }
    // Live integration placeholder — returns no findings until the concrete
    // client lands. (Privacy: only the indicator value reaches this point.)
    return { data: { provider: this.name, configured: true, findings: [] }, riskHints: [] };
  }
}

export function buildOsintProviders(config: ConfigService): OsintProvider[] {
  return SPECS.map(
    (s) =>
      new ConfigGatedProvider(
        s.name,
        s.category,
        s.types,
        Boolean(config.get<string>(s.envKey)),
      ),
  );
}
