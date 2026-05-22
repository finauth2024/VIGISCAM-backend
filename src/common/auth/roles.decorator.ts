import { SetMetadata } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the listed roles (RBAC). Enforced by RolesGuard.
 * No @Roles() means any authenticated user may access the route.
 */
export const Roles = (...roles: MembershipRole[]) => SetMetadata(ROLES_KEY, roles);
