import { dailyLimitFor, todayUtcBucket } from './plan-limits';

describe('partner key plan limits', () => {
  it('returns a quota for FREE / PRO and unlimited for ENTERPRISE', () => {
    expect(dailyLimitFor('FREE')).toBe(1_000);
    expect(dailyLimitFor('PRO')).toBe(100_000);
    expect(dailyLimitFor('ENTERPRISE')).toBeNull();
  });

  it('PRO is at least 50x FREE — pricing tiers must be meaningfully separated', () => {
    expect(dailyLimitFor('PRO')! / dailyLimitFor('FREE')!).toBeGreaterThanOrEqual(50);
  });

  it('todayUtcBucket truncates to UTC midnight of the same date', () => {
    const at = new Date('2026-05-27T14:33:21.456Z');
    const b = todayUtcBucket(at);
    expect(b.toISOString()).toBe('2026-05-27T00:00:00.000Z');
  });
});
