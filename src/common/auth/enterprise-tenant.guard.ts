import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { TenantType } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './auth.types';

/**
 * Restricts a route to TenantType.ENTERPRISE + ACTIVE. Mirrors the
 * other portal guards. Roles further narrow which membership labels
 * can act inside the portal (@Roles ENTERPRISE_ADMIN).
 */
@Injectable()
export class EnterpriseTenantGuard implements CanActivate {
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
    if (tenant.type !== TenantType.ENTERPRISE) {
      throw new ForbiddenException('Enterprise admin is restricted to enterprise tenants');
    }
    if (tenant.status !== 'ACTIVE') {
      throw new ForbiddenException('Tenant is not active');
    }
    return true;
  }
}
