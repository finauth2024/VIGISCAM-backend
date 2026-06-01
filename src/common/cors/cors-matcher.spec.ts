import { buildCorsMatchers, isOriginAllowed } from './cors-matcher';

describe('CORS matcher', () => {
  describe('exact origins', () => {
    const m = buildCorsMatchers(['https://vigiscam.com', 'https://www.vigiscam.com']);
    it('allows an exact match', () => {
      expect(isOriginAllowed(m, 'https://vigiscam.com')).toBe(true);
      expect(isOriginAllowed(m, 'https://www.vigiscam.com')).toBe(true);
    });
    it('rejects a near-miss', () => {
      expect(isOriginAllowed(m, 'http://vigiscam.com')).toBe(false); // http vs https
      expect(isOriginAllowed(m, 'https://vigiscam.com.attacker.io')).toBe(false);
      expect(isOriginAllowed(m, 'https://evil.com')).toBe(false);
    });
  });

  describe('glob patterns', () => {
    const m = buildCorsMatchers(['https://*.vercel.app']);
    it('matches any single-segment subdomain', () => {
      expect(isOriginAllowed(m, 'https://vigiscam-frontend.vercel.app')).toBe(true);
      expect(isOriginAllowed(m, 'https://vigiscam-frontend-git-feature-x.vercel.app')).toBe(true);
    });
    it('rejects multi-segment subdomain hijacks', () => {
      // A naive `*` → `.*` translation would let this through.
      expect(isOriginAllowed(m, 'https://evil.com.vercel.app')).toBe(false);
      expect(isOriginAllowed(m, 'https://evil.attacker.io.vercel.app.attacker.com')).toBe(false);
    });
    it('rejects the bare apex', () => {
      expect(isOriginAllowed(m, 'https://vercel.app')).toBe(false);
    });
  });

  describe('mixed exact + glob', () => {
    const m = buildCorsMatchers(['https://vigiscam.com', 'https://*.vercel.app']);
    it('matches either', () => {
      expect(isOriginAllowed(m, 'https://vigiscam.com')).toBe(true);
      expect(isOriginAllowed(m, 'https://preview-abc.vercel.app')).toBe(true);
    });
  });

  describe('no Origin header', () => {
    it('is allowed (same-origin or non-browser caller)', () => {
      expect(isOriginAllowed([], undefined)).toBe(true);
      expect(isOriginAllowed(buildCorsMatchers(['https://x']), undefined)).toBe(true);
    });
  });
});
