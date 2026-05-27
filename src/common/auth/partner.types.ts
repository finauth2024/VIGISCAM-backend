import { PartnerApiKeyPlan, PartnerApiKeyScope } from '@prisma/client';

/**
 * The partner principal attached to `request.partner` after a successful
 * X-API-Key authentication. Always carries the tenant id — partner endpoints
 * are tenant-isolated by construction.
 */
export interface PartnerPrincipal {
  keyId: string;
  tenantId: string;
  keyPrefix: string;
  scopes: PartnerApiKeyScope[];
  plan: PartnerApiKeyPlan;
}
