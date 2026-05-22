import { levelForScore, recommendedActionForLevel, scoreSignals } from './risk.scoring';

describe('risk scoring', () => {
  it('sums known signal weights', () => {
    expect(scoreSignals(['URGENCY', 'SECRECY'])).toBe(30);
  });

  it('caps the score at 100', () => {
    expect(
      scoreSignals([
        'REMOTE_ACCESS',
        'GIFT_CARD_REQUEST',
        'CRYPTO_TRANSFER',
        'FAKE_AUTHORITY',
        'THREAT_LANGUAGE',
      ]),
    ).toBe(100);
  });

  it('scores an empty signal list as zero', () => {
    expect(scoreSignals([])).toBe(0);
  });

  it('maps scores to the right levels', () => {
    expect(levelForScore(0)).toBe('LOW');
    expect(levelForScore(30)).toBe('LOW');
    expect(levelForScore(31)).toBe('MEDIUM');
    expect(levelForScore(60)).toBe('MEDIUM');
    expect(levelForScore(61)).toBe('HIGH');
    expect(levelForScore(85)).toBe('HIGH');
    expect(levelForScore(86)).toBe('CRITICAL');
    expect(levelForScore(100)).toBe('CRITICAL');
  });

  it('recommends intervention only at critical risk', () => {
    expect(recommendedActionForLevel('CRITICAL')).toBe('TRIGGER_INTERVENTION');
    expect(recommendedActionForLevel('HIGH')).toBe('REQUIRE_VERIFICATION');
    expect(recommendedActionForLevel('LOW')).toBe('MONITOR');
  });
});
