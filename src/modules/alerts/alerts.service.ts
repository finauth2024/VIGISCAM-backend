import { Injectable, NotFoundException } from '@nestjs/common';
import { Alert } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateAlertInput } from './alerts.types';

/**
 * Alerts. Phase 1D persists alerts (in-app, retrievable by the user).
 * Email / SMS / push / WebSocket delivery channels are added in later phases.
 */
@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateAlertInput): Promise<Alert> {
    return this.prisma.alert.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        riskEventId: input.riskEventId,
        type: input.type,
        severity: input.severity,
        title: input.title,
        message: input.message,
      },
    });
  }

  listForUser(user: AuthenticatedUser, unreadOnly = false): Promise<Alert[]> {
    return this.prisma.alert.findMany({
      where: { userId: user.userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markRead(user: AuthenticatedUser, id: string): Promise<Alert> {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert || alert.userId !== user.userId) {
      throw new NotFoundException('Alert not found');
    }
    return this.prisma.alert.update({
      where: { id },
      data: { readAt: alert.readAt ?? new Date() },
    });
  }
}
