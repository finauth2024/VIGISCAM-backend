import { deriveClusterKey, domainRoot, emailDomain } from './clustering';

describe('clustering logic', () => {
  describe('domainRoot', () => {
    it('reduces a hostname to its last two labels', () => {
      expect(domainRoot('login.secure.example.com')).toBe('example.com');
      expect(domainRoot('example.com')).toBe('example.com');
      expect(domainRoot('a.b.c.scam-site.net')).toBe('scam-site.net');
    });

    it('rejects values that are not hostnames', () => {
      expect(domainRoot('localhost')).toBeNull();
      expect(domainRoot('')).toBeNull();
      expect(domainRoot('two words.com')).toBeNull();
    });
  });

  describe('emailDomain', () => {
    it('extracts the domain part', () => {
      expect(emailDomain('support@scam-mail.com')).toBe('scam-mail.com');
      expect(emailDomain('a.b@mail.example.org')).toBe('mail.example.org');
    });

    it('rejects malformed addresses', () => {
      expect(emailDomain('not-an-email')).toBeNull();
      expect(emailDomain('user@localhost')).toBeNull();
    });
  });

  describe('deriveClusterKey', () => {
    it('clusters domains and URLs by domain root', () => {
      expect(deriveClusterKey('DOMAIN', 'pay.secure-bank-login.com')).toEqual({
        key: 'domain-root:secure-bank-login.com',
        matchType: 'SHARED_DOMAIN_ROOT',
        label: 'Domain root — secure-bank-login.com',
      });
      expect(deriveClusterKey('URL', 'https://verify.secure-bank-login.com/path')?.key).toBe(
        'domain-root:secure-bank-login.com',
      );
    });

    it('clusters emails by email domain', () => {
      expect(deriveClusterKey('EMAIL', 'agent@fraud-team.net')).toEqual({
        key: 'email-domain:fraud-team.net',
        matchType: 'SHARED_EMAIL',
        label: 'Email domain — fraud-team.net',
      });
    });

    it('does not auto-cluster other indicator types', () => {
      expect(deriveClusterKey('PHONE', '+15551234567')).toBeNull();
      expect(deriveClusterKey('CRYPTO_WALLET', '0xabc')).toBeNull();
      expect(deriveClusterKey('SCAM_PHRASE', 'do not tell anyone')).toBeNull();
    });
  });
});
