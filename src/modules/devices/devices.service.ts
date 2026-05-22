import { Injectable, NotFoundException } from '@nestjs/common';
import { Device } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EnrollDeviceDto } from './dto/enroll-device.dto';

/**
 * Devices belong to a user within a tenant. Every read/write is scoped to the
 * authenticated user — a caller can only ever see or change their own devices.
 */
@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  enroll(user: AuthenticatedUser, dto: EnrollDeviceDto): Promise<Device> {
    return this.prisma.device.create({
      data: {
        userId: user.userId,
        tenantId: user.tenantId,
        name: dto.name,
        type: dto.type,
        platform: dto.platform,
      },
    });
  }

  listForUser(user: AuthenticatedUser): Promise<Device[]> {
    return this.prisma.device.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async heartbeat(user: AuthenticatedUser, deviceId: string): Promise<Device> {
    await this.requireOwnedDevice(user, deviceId);
    return this.prisma.device.update({
      where: { id: deviceId },
      data: { lastSeenAt: new Date(), status: 'ACTIVE' },
    });
  }

  async revoke(user: AuthenticatedUser, deviceId: string): Promise<Device> {
    await this.requireOwnedDevice(user, deviceId);
    return this.prisma.device.update({
      where: { id: deviceId },
      data: { status: 'REVOKED' },
    });
  }

  private async requireOwnedDevice(user: AuthenticatedUser, deviceId: string): Promise<Device> {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device || device.userId !== user.userId) {
      throw new NotFoundException('Device not found');
    }
    return device;
  }
}
