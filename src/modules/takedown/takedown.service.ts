import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TakedownRequest, TakedownStatus } from '@prisma/client';
import { AuthenticatedUser, RequestContext } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { CreateTakedownDto } from './dto/create-takedown.dto';
import { UpdateTakedownStatusDto } from './dto/update-takedown-status.dto';

/** Legal status transitions for a takedown request (PDF §27). */
const TRANSITIONS: Record<TakedownStatus, TakedownStatus[]> = {
  DRAFT: ['SUBMITTED', 'WITHDRAWN'],
  SUBMITTED: ['ACKNOWLEDGED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'WITHDRAWN'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'COMPLETED', 'REJECTED', 'WITHDRAWN'],
  IN_PROGRESS: ['COMPLETED', 'REJECTED', 'WITHDRAWN'],
  COMPLETED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

const TERMINAL: TakedownStatus[] = ['COMPLETED', 'REJECTED', 'WITHDRAWN'];

/**
 * Takedown request tracking (PDF §27). When a registry entry is verified,
 * VIGISCAM coordinates with the providers behind the scam infrastructure
 * (registrars, hosts, telcos, platforms) to get it removed. This service
 * tracks each request's lifecycle. Operational and internal-only — never
 * public. Every transition is written to the Evidence Vault.
 */
@Injectable()
export class TakedownService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
  ) {}

  /** Open a takedown request (DRAFT) against a registry entry. */
  async createTakedown(
    actor: AuthenticatedUser,
    dto: CreateTakedownDto,
    ctx: RequestContext = {},
  ): Promise<TakedownRequest> {
    const entry = await this.prisma.registryEntry.findUnique({
      where: { id: dto.registryEntryId },
    });
    if (!entry) {
      throw new NotFoundException('Registry entry not found');
    }
    if (entry.status === 'REJECTED') {
      throw new BadRequestException('Cannot open a takedown for a rejected registry entry');
    }

    const takedown = await this.prisma.takedownRequest.create({
      data: {
        registryEntryId: entry.id,
        providerType: dto.providerType,
        providerName: dto.providerName,
        providerReference: dto.providerReference,
        details: dto.details,
        status: 'DRAFT',
      },
    });

    await this.logEvidence(
      takedown,
      actor,
      'TAKEDOWN_CREATED',
      `Takedown request drafted against ${dto.providerName} (${dto.providerType})`,
      ctx,
    );
    return takedown;
  }

  /** List takedown requests, optionally filtered by status. */
  listTakedowns(status?: string): Promise<TakedownRequest[]> {
    const valid = (Object.values(TakedownStatus) as string[]).includes(status ?? '');
    return this.prisma.takedownRequest.findMany({
      where: valid ? { status: status as TakedownStatus } : {},
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  /** A single takedown request with its registry entry. */
  async getTakedown(id: string) {
    const takedown = await this.prisma.takedownRequest.findUnique({
      where: { id },
      include: { registryEntry: true },
    });
    if (!takedown) {
      throw new NotFoundException('Takedown request not found');
    }
    return takedown;
  }

  /** Advance a takedown request to a new status (transition-validated). */
  async updateStatus(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateTakedownStatusDto,
    ctx: RequestContext = {},
  ): Promise<TakedownRequest> {
    const takedown = await this.getTakedown(id);
    const allowed = TRANSITIONS[takedown.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot move a takedown from ${takedown.status} to ${dto.status}` +
          (allowed.length ? `; allowed: ${allowed.join(', ')}` : ' — it is already in a final state'),
      );
    }

    const data: Prisma.TakedownRequestUpdateInput = { status: dto.status };
    if (dto.providerReference !== undefined) {
      data.providerReference = dto.providerReference;
    }
    if (dto.notes !== undefined) {
      data.outcomeNotes = dto.notes;
    }
    if (dto.status === 'SUBMITTED') {
      data.submittedByUserId = actor.userId;
      data.submittedAt = new Date();
    }
    if (TERMINAL.includes(dto.status)) {
      data.resolvedByUserId = actor.userId;
      data.resolvedAt = new Date();
    }

    const updated = await this.prisma.takedownRequest.update({ where: { id }, data });

    await this.logEvidence(
      updated,
      actor,
      `TAKEDOWN_${dto.status}`,
      `Takedown request moved to ${dto.status}`,
      ctx,
    );
    return updated;
  }

  private logEvidence(
    takedown: TakedownRequest,
    actor: AuthenticatedUser,
    eventType: string,
    description: string,
    ctx: RequestContext,
  ): Promise<unknown> {
    return this.evidence.append({
      tenantId: null,
      actorId: actor.userId,
      actorType: 'ADMIN',
      entityType: 'TAKEDOWN_REQUEST',
      entityId: takedown.id,
      eventType,
      eventDescription: description,
      metadata: {
        status: takedown.status,
        providerType: takedown.providerType,
        registryEntryId: takedown.registryEntryId,
      },
      ipAddress: ctx.ip ?? null,
    });
  }
}
