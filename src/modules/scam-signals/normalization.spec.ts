import {
  normalizeDomain,
  normalizeEmail,
  normalizeIndicator,
  normalizePhone,
  normalizePhrase,
  normalizeWallet,
} from './normalization';

describe('indicator normalization', () => {
  it('normalizes phone numbers to E.164', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('+15551234567');
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('normalizes domains — strips scheme, path and www', () => {
    expect(normalizeDomain('https://secure-login.example.com/path?x=1')).toBe(
      'secure-login.example.com',
    );
    expect(normalizeDomain('WWW.Example.COM')).toBe('example.com');
  });

  it('lowercases and trims emails', () => {
    expect(normalizeEmail('  Support@Example.com ')).toBe('support@example.com');
  });

  it('lowercases EVM wallets, leaves others untouched', () => {
    expect(normalizeWallet('0xABC123')).toBe('0xabc123');
    expect(normalizeWallet(' bc1QexAmple ')).toBe('bc1QexAmple');
  });

  it('collapses whitespace in phrases', () => {
    expect(normalizePhrase('  Do   NOT  tell anyone ')).toBe('do not tell anyone');
  });

  it('dispatches by indicator type', () => {
    expect(normalizeIndicator('EMAIL', 'A@B.COM')).toBe('a@b.com');
    expect(normalizeIndicator('PHONE', '555-123-4567')).toBe('+15551234567');
  });
});
