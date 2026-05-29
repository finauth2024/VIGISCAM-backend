import { BadRequestException } from '@nestjs/common';
import { assertPublicSafeLanguage, findUnsafeLanguage } from './safe-language';

describe('safe-language enforcement', () => {
  describe('findUnsafeLanguage', () => {
    it('flags direct identity accusations', () => {
      expect(findUnsafeLanguage('This person is a scammer.')).not.toBeNull();
      expect(findUnsafeLanguage('The business is a fraudster operation.')).not.toBeNull();
      expect(findUnsafeLanguage('This company is criminal.')).not.toBeNull();
      expect(findUnsafeLanguage('They are scammers working together.')).not.toBeNull();
      expect(findUnsafeLanguage('This number is owned by a scammer.')).not.toBeNull();
    });

    it('is case-insensitive', () => {
      expect(findUnsafeLanguage('IS A SCAMMER')).not.toBeNull();
    });

    it('allows status-based, behaviour-describing language', () => {
      expect(
        findUnsafeLanguage('This domain impersonates a bank to harvest login credentials.'),
      ).toBeNull();
      expect(
        findUnsafeLanguage(
          'High-risk indicator associated with a crypto investment scam campaign.',
        ),
      ).toBeNull();
      expect(
        findUnsafeLanguage('Verified scam intelligence — do not enter personal details.'),
      ).toBeNull();
      expect(findUnsafeLanguage('Suspicious pattern reported across multiple sources.')).toBeNull();
    });
  });

  describe('assertPublicSafeLanguage', () => {
    it('throws a BadRequestException on unsafe text', () => {
      expect(() =>
        assertPublicSafeLanguage('This person is a scammer.', 'publicSafeSummary'),
      ).toThrow(BadRequestException);
    });

    it('passes public-safe text through', () => {
      expect(() =>
        assertPublicSafeLanguage('This domain impersonates a bank.', 'publicSafeSummary'),
      ).not.toThrow();
    });
  });
});
