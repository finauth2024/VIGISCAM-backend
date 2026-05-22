import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { MembershipRole } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser } from './auth.types';
import { ROLES_KEY } from './roles.decorator';

/**
 * Role-based authorization (RBAC). Runs after JwtAuthGuard. A route with no
 * @Roles() is open to any authenticated user; otherwise the user's role must
 * be in the allowed set. Registered as an APP_GUARD.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<MembershipRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }
    if (!required.includes(user.role)) {
      throw new ForbiddenException('Insufficient role for this action');
    }
    return true;
  }
}
