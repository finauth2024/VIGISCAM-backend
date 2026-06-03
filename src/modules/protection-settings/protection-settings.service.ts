import { Injectable } from '@nestjs/common';
import { ProtectionSettings, UserProfile } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateProtectionSettingsDto } from './dto/update-protection-settings.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';

/**
 * Reads/writes the per-user ProtectionSettings + UserProfile (CP-1). Settings
 * are created lazily with safe defaults on first read so every user always has
 * a row for the enforcement engine to evaluate.
 */
@Injectable()
export class ProtectionSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Get (or lazily create with defaults) the user's protection settings. */
  async getSettings(user: AuthenticatedUser): Promise<ProtectionSettings> {
    const existing = await this.prisma.protectionSettings.findUnique({
      where: { userId: user.userId },
    });
    if (existing) return existing;
    return this.prisma.protectionSettings.create({ data: { userId: user.userId } });
  }

  async updateSettings(
    user: AuthenticatedUser,
    dto: UpdateProtectionSettingsDto,
  ): Promise<ProtectionSettings> {
    const data = {
      ...dto,
      highRiskAmountThresholdMinor:
        dto.highRiskAmountThresholdMinor != null
          ? BigInt(dto.highRiskAmountThresholdMinor)
          : undefined,
    };
    return this.prisma.protectionSettings.upsert({
      where: { userId: user.userId },
      create: { userId: user.userId, ...data },
      update: data,
    });
  }

  async getProfile(user: AuthenticatedUser): Promise<UserProfile> {
    const existing = await this.prisma.userProfile.findUnique({
      where: { userId: user.userId },
    });
    if (existing) return existing;
    return this.prisma.userProfile.create({ data: { userId: user.userId } });
  }

  async updateProfile(
    user: AuthenticatedUser,
    dto: UpdateUserProfileDto,
  ): Promise<UserProfile> {
    return this.prisma.userProfile.upsert({
      where: { userId: user.userId },
      create: { userId: user.userId, ...dto },
      update: dto,
    });
  }
}
