import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Membership, MembershipRole, User } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { JwtPayload, RequestContext } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PasswordService } from '../../common/security/password.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    tenantId: string;
    role: MembershipRole;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshTtlDays: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly passwords: PasswordService,
    config: ConfigService,
  ) {
    // Access-token lifetime is applied via JwtModule's signOptions.
    this.refreshTtlDays = config.get<number>('jwt.refreshTtlDays', 7);
  }

  /** Create a user, their personal tenant, and an owning membership. */
  async register(dto: RegisterDto, ctx: RequestContext): Promise<AuthResult> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await this.passwords.hash(dto.password);
    const fullName = dto.fullName.trim();

    const { user, membership } = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: `${fullName}'s space`, type: 'PERSONAL' },
      });
      const createdUser = await tx.user.create({
        data: { email, passwordHash, fullName },
      });
      const createdMembership = await tx.membership.create({
        data: {
          userId: createdUser.id,
          tenantId: tenant.id,
          role: 'INDIVIDUAL',
          isPrimary: true,
        },
      });
      return { user: createdUser, membership: createdMembership };
    });

    await this.writeAudit('USER_REGISTERED', user.id, ctx);
    this.logger.log(`New user registered: ${user.id}`);
    return this.issueTokens(user, membership, ctx);
  }

  /** Verify credentials and issue a token pair. */
  async login(dto: LoginDto, ctx: RequestContext): Promise<AuthResult> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const passwordOk = user
      ? await this.passwords.compare(dto.password, user.passwordHash)
      : false;
    // Same response whether the email exists or not — no account enumeration.
    if (!user || !passwordOk) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('This account is not active');
    }
    const membership = await this.getPrimaryMembership(user.id);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.writeAudit('USER_LOGIN', user.id, ctx);
    return this.issueTokens(user, membership, ctx);
  }

  /** Rotate a refresh token: validate it, issue a new pair, spend the old one. */
  async refresh(rawToken: string, ctx: RequestContext): Promise<AuthResult> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
      include: { user: true },
    });
    if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (stored.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('This account is not active');
    }
    const membership = await this.getPrimaryMembership(stored.userId);
    const result = await this.issueTokens(stored.user, membership, ctx);
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return result;
  }

  /** Revoke a refresh token (logout). */
  async logout(rawToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** The current user and all of their tenant memberships. */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { memberships: { include: { tenant: true } } },
    });
    if (!user) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      status: user.status,
      memberships: user.memberships.map((m) => ({
        tenantId: m.tenantId,
        tenantName: m.tenant.name,
        tenantType: m.tenant.type,
        role: m.role,
        isPrimary: m.isPrimary,
      })),
    };
  }

  private async getPrimaryMembership(userId: string): Promise<Membership> {
    const membership = await this.prisma.membership.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { isPrimary: 'desc' },
    });
    if (!membership) {
      throw new UnauthorizedException('No active tenant membership for this account');
    }
    return membership;
  }

  private async issueTokens(
    user: User,
    membership: Membership,
    ctx: RequestContext,
  ): Promise<AuthResult> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: membership.tenantId,
      role: membership.role,
      type: 'access',
    };
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = randomBytes(40).toString('hex');
    const expiresAt = new Date(Date.now() + this.refreshTtlDays * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
        userAgent: ctx.userAgent,
        ipAddress: ctx.ip,
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        tenantId: membership.tenantId,
        role: membership.role,
      },
    };
  }

  /** Refresh tokens are high-entropy — a fast SHA-256 hash is sufficient at rest. */
  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private async writeAudit(action: string, actorId: string, ctx: RequestContext): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId,
        actorType: 'USER',
        action,
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });
  }
}
