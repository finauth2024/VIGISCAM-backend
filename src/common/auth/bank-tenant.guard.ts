import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { TenantType } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from './auth.types';

/**
 * Restricts a route to callers whose active tenant has `TenantType.BANK`.
 *
 * Used in addition to (not instead of) RolesGuard — the controller can
 * also restrict by role (`BANK_ADMIN | BANK_ANALYST`), this guard
 * enforces that the *tenant itself* is a bank, not that the role label
 * implies one. Two guards because the role labels are nominal and the
 * tenant type is authoritative.
 *
 * Per-request DB hit is intentionally simple — bank portal endpoints
 * are low-RPS and we don't want a cross-process cache invalidation
 * dependency on a tenant-type change. Move to CacheService if traffic
 * proves it matters.
 */
@Injectable()
export class BankTenantGuard implements CanActivate {
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
    if (tenant.type !== TenantType.BANK) {
      throw new ForbiddenException('Bank portal is restricted to bank tenants');
    }
    if (tenant.status !== 'ACTIVE') {
      throw new ForbiddenException('Tenant is not active');
    }
    return true;
  }
}
