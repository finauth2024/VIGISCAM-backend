import { PublicAlertStatus } from '@prisma/client';

/**
 * Public alert lifecycle (PDF §43). Alerts are public statements about real
 * scam infrastructure — they go through DRAFT review before publication and
 * are withdrawable / expirable. EXPIRED and WITHDRAWN are terminal.
 */
export const ALERT_TRANSITIONS: Record<PublicAlertStatus, PublicAlertStatus[]> = {
  DRAFT: ['PUBLISHED', 'WITHDRAWN'],
  PUBLISHED: ['EXPIRED', 'WITHDRAWN'],
  EXPIRED: [],
  WITHDRAWN: [],
};

export function canTransition(from: PublicAlertStatus, to: PublicAlertStatus): boolean {
  return ALERT_TRANSITIONS[from].includes(to);
}
