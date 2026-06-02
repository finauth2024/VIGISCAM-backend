import { planSatisfies, PLAN_RANK } from './plan-rank';

describe('plan-rank', () => {
  it('orders FREE < BASIC < FAMILY_GUARDIAN < PREMIUM_SHIELD', () => {
    expect(PLAN_RANK.FREE).toBeLessThan(PLAN_RANK.BASIC);
    expect(PLAN_RANK.BASIC).toBeLessThan(PLAN_RANK.FAMILY_GUARDIAN);
    expect(PLAN_RANK.FAMILY_GUARDIAN).toBeLessThan(PLAN_RANK.PREMIUM_SHIELD);
  });

  it('a higher tier satisfies a lower requirement', () => {
    expect(planSatisfies('PREMIUM_SHIELD', 'FAMILY_GUARDIAN')).toBe(true);
    expect(planSatisfies('PREMIUM_SHIELD', 'FREE')).toBe(true);
    expect(planSatisfies('FAMILY_GUARDIAN', 'BASIC')).toBe(true);
  });

  it('an equal tier satisfies', () => {
    expect(planSatisfies('BASIC', 'BASIC')).toBe(true);
  });

  it('a lower tier does not satisfy a higher requirement', () => {
    expect(planSatisfies('FREE', 'BASIC')).toBe(false);
    expect(planSatisfies('BASIC', 'PREMIUM_SHIELD')).toBe(false);
  });
});
