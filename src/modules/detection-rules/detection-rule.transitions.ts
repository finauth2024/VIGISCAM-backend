import { DetectionRuleStatus } from '@prisma/client';

/**
 * Detection-rule lifecycle (PDF §33). The no-auto-activation guardrail is
 * structural: there is no edge from DRAFT directly to ACTIVE. A rule must be
 * created/landed as DRAFT, moved to TESTING, and only then promoted to ACTIVE
 * — every transition by an explicit reviewer/admin decision.
 *
 * RETIRED is terminal.
 */
export const RULE_TRANSITIONS: Record<DetectionRuleStatus, DetectionRuleStatus[]> = {
  DRAFT: ['TESTING', 'RETIRED'],
  TESTING: ['ACTIVE', 'DISABLED', 'DRAFT', 'RETIRED'],
  ACTIVE: ['DISABLED', 'RETIRED'],
  DISABLED: ['TESTING', 'ACTIVE', 'RETIRED'],
  RETIRED: [],
};

/** True iff moving a rule from `from` to `to` is a legal lifecycle transition. */
export function canTransition(from: DetectionRuleStatus, to: DetectionRuleStatus): boolean {
  return RULE_TRANSITIONS[from].includes(to);
}

/** Rule statuses that are immutable — editing requires moving the rule out first. */
export const NON_EDITABLE_STATUSES: DetectionRuleStatus[] = ['ACTIVE', 'RETIRED'];

export function isEditable(status: DetectionRuleStatus): boolean {
  return !NON_EDITABLE_STATUSES.includes(status);
}
