import { AlertSeverity } from '@prisma/client';

/** Input for raising a user-facing alert. */
export interface CreateAlertInput {
  tenantId: string;
  userId: string;
  riskEventId?: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  message: string;
}
