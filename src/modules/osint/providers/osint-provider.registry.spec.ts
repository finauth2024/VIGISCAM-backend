import { ConfigService } from '@nestjs/config';
import { OsintProviderRegistry } from './osint-provider.registry';

function registry(env: Record<string, string> = {}): OsintProviderRegistry {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new OsintProviderRegistry(config);
}

describe('OsintProviderRegistry', () => {
  it('exposes the full provider catalog, all not-live by default', () => {
    const cat = registry().catalog();
    const categories = cat.map((c) => c.category);
    expect(categories).toEqual(
      expect.arrayContaining([
        'WHOIS',
        'PASSIVE_DNS',
        'CERT_TRANSPARENCY',
        'DOMAIN_REPUTATION',
        'URL_REPUTATION',
        'PHONE_REPUTATION',
        'EMAIL_REPUTATION',
        'WALLET_REPUTATION',
        'BLOCKCHAIN_EXPLORER',
        'TAKEDOWN_HISTORY',
        'PUBLIC_ADVISORY',
      ]),
    );
    expect(cat.every((c) => c.live === false)).toBe(true);
  });

  it('marks a provider live when its API key env var is set', () => {
    const cat = registry({ OSINT_WHOIS_API_KEY: 'k' }).catalog();
    expect(cat.find((c) => c.name === 'whois')?.live).toBe(true);
    expect(cat.find((c) => c.name === 'passive-dns')?.live).toBe(false);
  });

  it('selects only providers that support the indicator type', async () => {
    const runs = await registry().enrich({
      indicatorType: 'CRYPTO_WALLET',
      normalizedIndicator: '0xabc',
    });
    const names = runs.map((r) => r.provider.name).sort();
    // wallet-reputation, blockchain-explorer, takedown-history, public-advisory
    expect(names).toEqual(['blockchain-explorer', 'public-advisory', 'takedown-history', 'wallet-reputation']);
  });

  it('not-configured providers return an honest empty result (no fabricated data)', async () => {
    const runs = await registry().enrich({ indicatorType: 'PHONE', normalizedIndicator: '+15551234567' });
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) {
      expect(r.result.riskHints).toEqual([]);
      expect(r.result.data).toMatchObject({ configured: false });
    }
  });
});
