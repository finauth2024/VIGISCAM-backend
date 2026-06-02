import { planSatisfies, PLAN_RANK } from './plan-rank';

describe('plan-rank', () => {
  it('orders FREE < PRO < ENTERPRISE', () => {
    expect(PLAN_RANK.FREE).toBeLessThan(PLAN_RANK.PRO);
    expect(PLAN_RANK.PRO).toBeLessThan(PLAN_RANK.ENTERPRISE);
  });

  it('a higher tier satisfies a lower requirement', () => {
    expect(planSatisfies('ENTERPRISE', 'PRO')).toBe(true);
    expect(planSatisfies('ENTERPRISE', 'FREE')).toBe(true);
    expect(planSatisfies('PRO', 'FREE')).toBe(true);
  });

  it('an equal tier satisfies', () => {
    expect(planSatisfies('PRO', 'PRO')).toBe(true);
  });

  it('a lower tier does not satisfy a higher requirement', () => {
    expect(planSatisfies('FREE', 'PRO')).toBe(false);
    expect(planSatisfies('PRO', 'ENTERPRISE')).toBe(false);
  });
});
