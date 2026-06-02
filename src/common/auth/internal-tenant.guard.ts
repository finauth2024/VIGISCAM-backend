import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { TenantType } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './auth.types';

/**
 * Restricts a route to TenantType.INTERNAL + ACTIVE — VIGISCAM staff.
 *
 * Defense-in-depth alongside @Roles(SUPER_ADMIN, REVIEWER, …). The
 * internal staff roles can only be granted on the single INTERNAL
 * tenant (see internal-admin.service), so @Roles alone would suffice;
 * this guard makes the tenant-type invariant explicit and matches the
 * pattern used by the other portal guards.
 */
@Injectable()
export class InternalTenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required');
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { type: true, status: true },
    });
    if (!tenant) {
      throw new ForbiddenException('Tenant not found');
    }
    if (tenant.type !== TenantType.INTERNAL) {
      throw new ForbiddenException('Internal console is restricted to VIGISCAM staff');
    }
    if (tenant.status !== 'ACTIVE') {
      throw new ForbiddenException('Tenant is not active');
    }
    return true;
  }
}
