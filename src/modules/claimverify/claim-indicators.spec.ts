import { extractClaimIndicators } from './claim-indicators';

describe('extractClaimIndicators', () => {
  it('pulls structured domain/email/phone/wallet/name indicators', () => {
    const out = extractClaimIndicators({
      websiteDomain: 'https://Global-Oil-Example.com/invest',
      email: 'Contact@Example.com',
      phone: '+1 (234) 567-8901',
      walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      personOrBusinessName: 'Global Oil Investment Group',
    });
    const byType = Object.fromEntries(out.map((i) => [i.indicatorType, i.indicatorValue]));
    expect(byType.DOMAIN).toBe('global-oil-example.com');
    expect(byType.EMAIL).toBe('contact@example.com');
    expect(byType.PHONE).toBe('+12345678901');
    expect(byType.CRYPTO_WALLET).toBe('0x1234567890abcdef1234567890abcdef12345678');
    expect(byType.FAKE_COMPANY).toBe('Global Oil Investment Group');
  });

  it('ignores malformed values and non-object subjects', () => {
    expect(extractClaimIndicators(null)).toEqual([]);
    expect(extractClaimIndicators('a string')).toEqual([]);
    expect(extractClaimIndicators({ email: 'not-an-email', phone: 'abc' })).toEqual([]);
  });

  it('deduplicates repeated indicators', () => {
    const out = extractClaimIndicators({ domain: 'example.com', website: 'example.com' });
    expect(out.filter((i) => i.indicatorType === 'DOMAIN')).toHaveLength(1);
  });
});
