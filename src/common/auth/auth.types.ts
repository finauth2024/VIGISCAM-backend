import { MembershipRole } from '@prisma/client';

/** Claims carried inside a signed access token (JWT). */
export interface JwtPayload {
  sub: string; // user id
  email: string;
  tenantId: string; // the active tenant for this session
  role: MembershipRole;
  type: 'access';
}

/** The authenticated principal attached to `request.user` after JWT validation. */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  tenantId: string;
  role: MembershipRole;
}

/** Request metadata captured for audit logging. */
export interface RequestContext {
  ip?: string;
  userAgent?: string;
}
