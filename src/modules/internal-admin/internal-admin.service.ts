import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Membership, MembershipRole } from '@prisma/client';
import { AuthenticatedUser, RequestContext } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { ChangeInternalRoleDto } from './dto/change-internal-role.dto';
import { GrantInternalRoleDto } from './dto/grant-internal-role.dto';
import { INTERNAL_TENANT_ID } from './internal.constants';

/**
 * Internal-admin role management (PDF §7, §37). A SUPER_ADMIN grants, changes
 * and revokes the roles of internal VIGISCAM staff. Staff hold their role via
 * a Membership on the single INTERNAL tenant. Two non-negotiable guardrails:
 * an admin can never lock themselves out, and the last active SUPER_ADMIN can
 * never be removed or demoted. Every change is written to the Evidence Vault.
 */
@Injectable()
export class InternalAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
  ) {}

  /** List every internal staff membership and the account behind it. */
  listStaff() {
    return this.prisma.membership.findMany({
      where: { tenantId: INTERNAL_TENANT_ID },
      include: {
        user: { select: { id: true, email: true, fullName: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Grant an internal role to an existing account. */
  async grantRole(
    admin: AuthenticatedUser,
    dto: GrantInternalRoleDto,
    ctx: RequestContext = {},
  ): Promise<Membership> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException(
        'No VIGISCAM account with that email — the person must register an account first',
      );
    }

    const existing = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId: INTERNAL_TENANT_ID } },
    });
    if (existing && existing.status === 'ACTIVE') {
      throw new ConflictException(
        'This account already holds an internal role — change the role instead',
      );
    }

    const role = dto.role as MembershipRole;
    // The internal staff membership becomes the account's primary membership,
    // so the next login issues an access token that carries the internal role.
    const membership = await this.prisma.$transaction(async (tx) => {
      await tx.membership.updateMany({
        where: { userId: user.id },
        data: { isPrimary: false },
      });
      if (existing) {
        return tx.membership.update({
          where: { id: existing.id },
          data: { role, status: 'ACTIVE', isPrimary: true },
        });
      }
      return tx.membership.create({
        data: {
          userId: user.id,
          tenantId: INTERNAL_TENANT_ID,
          role,
          status: 'ACTIVE',
          isPrimary: true,
        },
      });
    });

    await this.logEvidence(
      admin,
      user.id,
      'INTERNAL_ROLE_GRANTED',
      `Internal role ${role} granted to ${email}`,
      role,
      ctx,
    );
    return membership;
  }

  /** Change the role of an existing internal staff membership. */
  async changeRole(
    admin: AuthenticatedUser,
    membershipId: string,
    dto: ChangeInternalRoleDto,
    ctx: RequestContext = {},
  ): Promise<Membership> {
    const membership = await this.requireInternalMembership(membershipId);
    const newRole = dto.role as MembershipRole;

    if (membership.role === newRole) {
      throw new BadRequestException(`This membership already holds the ${newRole} role`);
    }
    if (membership.userId === admin.userId && newRole !== 'SUPER_ADMIN') {
      throw new BadRequestException('You cannot demote your own SUPER_ADMIN role');
    }
    if (membership.role === 'SUPER_ADMIN' && newRole !== 'SUPER_ADMIN') {
      await this.assertNotLastSuperAdmin(membership.id);
    }

    const updated = await this.prisma.membership.update({
      where: { id: membership.id },
      data: { role: newRole },
    });
    await this.logEvidence(
      admin,
      membership.userId,
      'INTERNAL_ROLE_CHANGED',
      `Internal role changed from ${membership.role} to ${newRole}`,
      newRole,
      ctx,
    );
    return updated;
  }

  /** Revoke an internal staff membership (status -> REMOVED). */
  async revokeRole(
    admin: AuthenticatedUser,
    membershipId: string,
    ctx: RequestContext = {},
  ): Promise<Membership> {
    const membership = await this.requireInternalMembership(membershipId);

    if (membership.userId === admin.userId) {
      throw new BadRequestException('You cannot revoke your own internal role');
    }
    if (membership.status !== 'ACTIVE') {
      throw new BadRequestException('This internal membership is not active');
    }
    if (membership.role === 'SUPER_ADMIN') {
      await this.assertNotLastSuperAdmin(membership.id);
    }

    const updated = await this.prisma.membership.update({
      where: { id: membership.id },
      data: { status: 'REMOVED', isPrimary: false },
    });
    await this.logEvidence(
      admin,
      membership.userId,
      'INTERNAL_ROLE_REVOKED',
      `Internal role ${membership.role} revoked`,
      membership.role,
      ctx,
    );
    return updated;
  }

  private async requireInternalMembership(id: string): Promise<Membership> {
    const membership = await this.prisma.membership.findUnique({ where: { id } });
    if (!membership || membership.tenantId !== INTERNAL_TENANT_ID) {
      throw new NotFoundException('Internal staff membership not found');
    }
    return membership;
  }

  /** Refuse any change that would leave VIGISCAM with no active SUPER_ADMIN. */
  private async assertNotLastSuperAdmin(excludeMembershipId: string): Promise<void> {
    const remaining = await this.prisma.membership.count({
      where: {
        tenantId: INTERNAL_TENANT_ID,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        id: { not: excludeMembershipId },
      },
    });
    if (remaining === 0) {
      throw new BadRequestException(
        'Cannot remove or demote the last active SUPER_ADMIN',
      );
    }
  }

  private logEvidence(
    admin: AuthenticatedUser,
    targetUserId: string,
    eventType: string,
    description: string,
    role: MembershipRole,
    ctx: RequestContext,
  ): Promise<unknown> {
    return this.evidence.append({
      tenantId: INTERNAL_TENANT_ID,
      actorId: admin.userId,
      actorType: 'ADMIN',
      entityType: 'USER',
      entityId: targetUserId,
      eventType,
      eventDescription: description,
      metadata: { role },
      ipAddress: ctx.ip ?? null,
    });
  }
}
