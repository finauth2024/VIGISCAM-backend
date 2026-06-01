import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { TenantType } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './auth.types';

/**
 * Restricts a route to callers whose active tenant has `TenantType.PLATFORM`
 * — the dedicated tenant type for dating apps, social platforms, and
 * marketplaces. Mirrors BankTenantGuard; we keep them as separate
 * classes (rather than a generic TenantTypeGuard) because the next two
 * tenant guards (Investigator, Enterprise) carry their own bespoke
 * status rules. Generalization is a 10F concern, not 10C.
 */
@Injectable()
export class PlatformTenantGuard implements CanActivate {
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
    if (tenant.type !== TenantType.PLATFORM) {
      throw new ForbiddenException('Platform portal is restricted to platform tenants');
    }
    if (tenant.status !== 'ACTIVE') {
      throw new ForbiddenException('Tenant is not active');
    }
    return true;
  }
}
