import { sanitize } from './sanitizer';

describe('ScamMirror input sanitizer', () => {
  describe('credit cards (Luhn-valid)', () => {
    // Well-known test card numbers — Luhn-valid, never issued to real
    // customers; provided in public Stripe / vendor docs.
    const VISA = '4242 4242 4242 4242';
    const MASTERCARD = '5555-5555-5555-4444';
    const AMEX = '3782 8224 6310 005';

    it.each([VISA, MASTERCARD, AMEX])('rejects %s', (card) => {
      const v = sanitize(`my card is ${card} please charge it`);
      expect(v).toEqual({ ok: false, reason: 'CREDIT_CARD' });
    });

    it('does not reject a non-Luhn-valid 16-digit string', () => {
      const v = sanitize('order number 1234567812345678');
      expect(v).toEqual({ ok: true });
    });

    it('does not reject a short numeric run', () => {
      expect(sanitize('I have 12 cats')).toEqual({ ok: true });
    });
  });

  describe('crypto private keys', () => {
    it('rejects an Ethereum 0x + 64-hex string', () => {
      const v = sanitize(
        'send to 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 now',
      );
      expect(v).toEqual({ ok: false, reason: 'ETH_PRIVATE_KEY' });
    });

    it('rejects an uppercase EVM key too', () => {
      const v = sanitize('0xAC0974BEC39A17E36BA4A6B4D238FF944BACB478CBED5EFCAE784D7BF4F2FF80');
      expect(v).toEqual({ ok: false, reason: 'ETH_PRIVATE_KEY' });
    });

    it('rejects a Bitcoin WIF key (5-prefix)', () => {
      const v = sanitize('5HueCGU8rMjxEXxiPuD5BDku4MkFqeZyd4dZ1jvhTVqvbTLvyTJ');
      expect(v).toEqual({ ok: false, reason: 'BITCOIN_WIF' });
    });

    it('rejects a compressed WIF key (K-prefix)', () => {
      const v = sanitize('KwdMAjGmerYanjeui5SHS7JkmpZvVipYvB2LJGU1ZxJwYvP98617');
      expect(v).toEqual({ ok: false, reason: 'BITCOIN_WIF' });
    });

    it('does not reject a normal ETH address (40 hex, not 64)', () => {
      expect(sanitize('send to 0x71C7656EC7ab88b098defB751B7401B5f6d8976F')).toEqual({ ok: true });
    });
  });

  describe('BIP39 mnemonics', () => {
    it('rejects a 12-word lowercase mnemonic', () => {
      const v = sanitize(
        'witch collapse practice feed shame open despair creek road again ice least',
      );
      expect(v).toEqual({ ok: false, reason: 'MNEMONIC_PHRASE' });
    });

    it('rejects a 24-word mnemonic', () => {
      const v = sanitize(
        'witch collapse practice feed shame open despair creek road again ice least witch collapse practice feed shame open despair creek road again ice least',
      );
      expect(v).toEqual({ ok: false, reason: 'MNEMONIC_PHRASE' });
    });

    it('does NOT flag normal sentence prose (mixed case, punctuation)', () => {
      const v = sanitize(
        'The contractor told me to send money quickly because the project starts tomorrow and they really need funding right now.',
      );
      expect(v).toEqual({ ok: true });
    });

    it('does NOT flag fewer than 12 consecutive lowercase words', () => {
      const v = sanitize('hello there friend buddy pal mate kind nice');
      expect(v).toEqual({ ok: true });
    });
  });

  describe('SSN', () => {
    it('rejects XXX-XX-XXXX format', () => {
      const v = sanitize('my SSN is 123-45-6789');
      expect(v).toEqual({ ok: false, reason: 'SSN' });
    });

    it('rejects a labelled run of 9 digits', () => {
      expect(sanitize('SSN 123456789')).toEqual({
        ok: false,
        reason: 'SSN',
      });
      expect(sanitize('Social Security: 123 45 6789')).toEqual({
        ok: false,
        reason: 'SSN',
      });
    });

    it('does NOT flag a 9-digit phone or order number without context', () => {
      expect(sanitize('order 123456789')).toEqual({ ok: true });
    });
  });

  describe('clean input passes through', () => {
    it.each([
      'pretend you are a tech support agent and demand gift cards',
      'I need to verify your bank account information',
      "I'm from the IRS and you owe back taxes",
      'just chatting in role-play',
      '',
    ])('accepts: %s', (input) => {
      expect(sanitize(input)).toEqual({ ok: true });
    });
  });

  describe('first-match-wins ordering', () => {
    it('reports CREDIT_CARD when both a card and a mnemonic are present', () => {
      const v = sanitize(
        'card 4242 4242 4242 4242 and mnemonic witch collapse practice feed shame open despair creek road again ice least',
      );
      expect(v).toEqual({ ok: false, reason: 'CREDIT_CARD' });
    });
  });
});
