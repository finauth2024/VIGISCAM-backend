import { stubOsintEnrich, STUB_OSINT_PROVIDER, STUB_OSINT_VERSION } from './osint-stub';

describe('OSINT stub', () => {
  it('returns a deterministic enrichment for the same input', () => {
    const a = stubOsintEnrich({ indicatorType: 'DOMAIN', normalizedIndicator: 'scam-site.com' });
    const b = stubOsintEnrich({ indicatorType: 'DOMAIN', normalizedIndicator: 'scam-site.com' });
    expect(a).toEqual(b);
    expect(a.provider).toBe(STUB_OSINT_PROVIDER);
    expect(a.modelVersion).toBe(STUB_OSINT_VERSION);
  });

  it('produces DOMAIN-specific fields and surfaces risk hints', () => {
    const r = stubOsintEnrich({ indicatorType: 'DOMAIN', normalizedIndicator: 'fresh.example.com' });
    expect(r.data).toHaveProperty('domainAgeDays');
    expect(r.data).toHaveProperty('registrar');
    expect(r.data).toHaveProperty('sslValid');
    expect(Array.isArray(r.riskHints)).toBe(true);
  });

  it('extracts the email domain for EMAIL indicators', () => {
    const r = stubOsintEnrich({ indicatorType: 'EMAIL', normalizedIndicator: 'attacker@evil.test' });
    expect(r.data.domain).toBe('evil.test');
  });

  it('classifies the chain for CRYPTO_WALLET indicators', () => {
    expect(stubOsintEnrich({ indicatorType: 'CRYPTO_WALLET', normalizedIndicator: '0xabc' }).data.chain).toBe('EVM');
    expect(stubOsintEnrich({ indicatorType: 'CRYPTO_WALLET', normalizedIndicator: 'bc1xyz' }).data.chain).toBe('BTC');
  });

  it('infers country code for E.164 phone numbers', () => {
    expect(stubOsintEnrich({ indicatorType: 'PHONE', normalizedIndicator: '+15551234567' }).data.country).toBe('US');
    expect(stubOsintEnrich({ indicatorType: 'PHONE', normalizedIndicator: '+447700900123' }).data.country).toBe('GB');
  });
});
