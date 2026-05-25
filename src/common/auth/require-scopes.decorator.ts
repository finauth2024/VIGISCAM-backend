import { SetMetadata } from '@nestjs/common';
import { PartnerApiKeyScope } from '@prisma/client';

export const PARTNER_SCOPES_KEY = 'partnerScopes';

/**
 * Restricts a partner-authenticated route to keys that carry every listed
 * scope. Enforced by ApiKeyGuard after the key is resolved.
 */
export const RequireScopes = (...scopes: PartnerApiKeyScope[]) =>
  SetMetadata(PARTNER_SCOPES_KEY, scopes);
