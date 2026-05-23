import { canTransition, isEditable, RULE_TRANSITIONS } from './detection-rule.transitions';

describe('detection rule transitions', () => {
  it('forbids DRAFT -> ACTIVE (the no-auto-activation guardrail)', () => {
    // PDF §33 governance: rules must never activate automatically without
    // proper reviewer/admin approval. A rule cannot skip TESTING.
    expect(canTransition('DRAFT', 'ACTIVE')).toBe(false);
  });

  it('requires TESTING (or DISABLED) before ACTIVE', () => {
    expect(canTransition('TESTING', 'ACTIVE')).toBe(true);
    expect(canTransition('DISABLED', 'ACTIVE')).toBe(true);
  });

  it('treats RETIRED as a terminal state', () => {
    expect(RULE_TRANSITIONS.RETIRED).toEqual([]);
    expect(canTransition('RETIRED', 'ACTIVE')).toBe(false);
    expect(canTransition('RETIRED', 'DRAFT')).toBe(false);
  });

  it('allows reasonable rollback paths', () => {
    expect(canTransition('TESTING', 'DRAFT')).toBe(true);
    expect(canTransition('ACTIVE', 'DISABLED')).toBe(true);
    expect(canTransition('DISABLED', 'TESTING')).toBe(true);
  });

  it('refuses no-op transitions', () => {
    expect(canTransition('DRAFT', 'DRAFT')).toBe(false);
    expect(canTransition('ACTIVE', 'ACTIVE')).toBe(false);
  });

  describe('isEditable', () => {
    it('blocks editing ACTIVE and RETIRED rules', () => {
      expect(isEditable('ACTIVE')).toBe(false);
      expect(isEditable('RETIRED')).toBe(false);
    });
    it('allows editing DRAFT / TESTING / DISABLED rules', () => {
      expect(isEditable('DRAFT')).toBe(true);
      expect(isEditable('TESTING')).toBe(true);
      expect(isEditable('DISABLED')).toBe(true);
    });
  });
});
