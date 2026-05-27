import { ALERT_TRANSITIONS, canTransition } from './public-alert.transitions';

describe('public alert transitions', () => {
  it('only allows DRAFT -> PUBLISHED / WITHDRAWN', () => {
    expect(canTransition('DRAFT', 'PUBLISHED')).toBe(true);
    expect(canTransition('DRAFT', 'WITHDRAWN')).toBe(true);
    expect(canTransition('DRAFT', 'EXPIRED')).toBe(false);
  });

  it('only allows PUBLISHED -> EXPIRED / WITHDRAWN (no re-draft)', () => {
    expect(canTransition('PUBLISHED', 'EXPIRED')).toBe(true);
    expect(canTransition('PUBLISHED', 'WITHDRAWN')).toBe(true);
    expect(canTransition('PUBLISHED', 'DRAFT')).toBe(false);
  });

  it('treats EXPIRED and WITHDRAWN as terminal', () => {
    expect(ALERT_TRANSITIONS.EXPIRED).toEqual([]);
    expect(ALERT_TRANSITIONS.WITHDRAWN).toEqual([]);
    expect(canTransition('EXPIRED', 'PUBLISHED')).toBe(false);
    expect(canTransition('WITHDRAWN', 'PUBLISHED')).toBe(false);
  });

  it('refuses no-op transitions', () => {
    expect(canTransition('PUBLISHED', 'PUBLISHED')).toBe(false);
  });
});
