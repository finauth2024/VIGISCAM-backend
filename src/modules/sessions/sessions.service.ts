import { Injectable, NotFoundException } from '@nestjs/common';
import { Session, SessionEvent } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { EvidenceEntity, EvidenceEventType } from '../evidence-vault/evidence.types';
import { SessionEventDto } from './dto/session-event.dto';
import { StartSessionDto } from './dto/start-session.dto';

/**
 * Monitored sessions (calls, screen-shares, remote-desktop, etc.). Every
 * read/write is scoped to the authenticated user. Sessions are where
 * FREEZEGUARD / A1SCAMSHIELD telemetry and risk scoring attach in later steps.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
  ) {}

  async start(user: AuthenticatedUser, dto: StartSessionDto): Promise<Session> {
    if (dto.deviceId) {
      const device = await this.prisma.device.findUnique({ where: { id: dto.deviceId } });
      if (!device || device.userId !== user.userId) {
        throw new NotFoundException('Device not found');
      }
    }
    const session = await this.prisma.session.create({
      data: {
        userId: user.userId,
        tenantId: user.tenantId,
        deviceId: dto.deviceId,
        type: dto.type,
      },
    });
    await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: EvidenceEntity.SESSION,
      entityId: session.id,
      eventType: EvidenceEventType.SESSION_STARTED,
      eventDescription: `${session.type} session started`,
      deviceId: dto.deviceId ?? null,
    });
    return session;
  }

  listForUser(user: AuthenticatedUser): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { userId: user.userId },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
  }

  async getById(user: AuthenticatedUser, id: string) {
    await this.requireOwnedSession(user, id);
    return this.prisma.session.findUnique({
      where: { id },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async recordEvent(
    user: AuthenticatedUser,
    sessionId: string,
    dto: SessionEventDto,
  ): Promise<SessionEvent> {
    await this.requireOwnedSession(user, sessionId);
    return this.prisma.sessionEvent.create({
      data: { sessionId, type: dto.type, detail: dto.detail },
    });
  }

  async end(user: AuthenticatedUser, id: string): Promise<Session> {
    const session = await this.requireOwnedSession(user, id);
    if (session.status === 'ENDED') {
      return session;
    }
    const ended = await this.prisma.session.update({
      where: { id },
      data: { status: 'ENDED', endedAt: new Date() },
    });
    await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: EvidenceEntity.SESSION,
      entityId: ended.id,
      eventType: EvidenceEventType.SESSION_ENDED,
      eventDescription: `${ended.type} session ended`,
    });
    return ended;
  }

  private async requireOwnedSession(user: AuthenticatedUser, id: string): Promise<Session> {
    const session = await this.prisma.session.findUnique({ where: { id } });
    if (!session || session.userId !== user.userId) {
      throw new NotFoundException('Session not found');
    }
    return session;
  }
}
