import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RegistryAppeal, RegistryAppealStatus } from '@prisma/client';
import { AuthenticatedUser, RequestContext } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { AppealDecision, DecideRegistryAppealDto } from './dto/decide-registry-appeal.dto';
import { CreateRegistryAppealDto } from './dto/create-registry-appeal.dto';
import { RegistryService } from './registry.service';

const APPEAL_ACK =
  'Appeal received. A VIGISCAM compliance reviewer will assess it. The registry entry is unchanged until a decision is made.';

export interface FileAppealResult {
  status: 'APPEAL_RECEIVED';
  message: string;
  appealId: string;
}

/**
 * Registry corrections & appeals (PDF §27). Anyone affected by a PUBLISHED
 * entry can contest it without logging in. Filing an appeal never alters the
 * entry — only a reviewed compliance decision can. Every step is written to
 * the Evidence Vault.
 */
@Injectable()
export class RegistryAppealService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly registry: RegistryService,
  ) {}

  /** Public: contest a published registry entry. */
  async fileAppeal(
    entryId: string,
    dto: CreateRegistryAppealDto,
    ctx: RequestContext = {},
  ): Promise<FileAppealResult> {
    // Only a PUBLISHED entry is publicly visible — and thus appealable. A
    // generic 404 avoids leaking the existence of non-public entries.
    const entry = await this.prisma.registryEntry.findFirst({
      where: { id: entryId, status: 'PUBLISHED' },
    });
    if (!entry) {
      throw new NotFoundException('Registry entry not found');
    }

    const appeal = await this.prisma.registryAppeal.create({
      data: {
        registryEntryId: entry.id,
        appealType: dto.appealType,
        status: 'SUBMITTED',
        submitterName: dto.submitterName,
        submitterEmail: dto.submitterEmail,
        submitterRelationship: dto.submitterRelationship,
        reason: dto.reason,
        requestedChange: dto.requestedChange,
      },
    });

    await this.evidence.append({
      tenantId: null,
      actorType: 'PUBLIC',
      entityType: 'REGISTRY_APPEAL',
      entityId: appeal.id,
      eventType: 'REGISTRY_APPEAL_FILED',
      eventDescription: `Appeal (${dto.appealType}) filed against a published registry entry`,
      metadata: { registryEntryId: entry.id, appealType: dto.appealType },
      ipAddress: ctx.ip ?? null,
    });

    // The public response never echoes back internal appeal state.
    return { status: 'APPEAL_RECEIVED', message: APPEAL_ACK, appealId: appeal.id };
  }

  /** Internal: list appeals, optionally filtered by status. */
  listAppeals(status?: string): Promise<RegistryAppeal[]> {
    const valid = (Object.values(RegistryAppealStatus) as string[]).includes(status ?? '');
    return this.prisma.registryAppeal.findMany({
      where: valid ? { status: status as RegistryAppealStatus } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** Internal: a single appeal with its contested entry. */
  async getAppeal(id: string) {
    const appeal = await this.prisma.registryAppeal.findUnique({
      where: { id },
      include: { registryEntry: true },
    });
    if (!appeal) {
      throw new NotFoundException('Registry appeal not found');
    }
    return appeal;
  }

  /** Internal: claim an appeal for review (SUBMITTED -> UNDER_REVIEW). */
  async startReview(
    reviewer: AuthenticatedUser,
    id: string,
    ctx: RequestContext = {},
  ): Promise<RegistryAppeal> {
    const appeal = await this.requireStatus(id, ['SUBMITTED']);
    const updated = await this.prisma.registryAppeal.update({
      where: { id: appeal.id },
      data: { status: 'UNDER_REVIEW', reviewedByUserId: reviewer.userId },
    });
    await this.logEvidence(
      updated,
      reviewer,
      'REVIEWER',
      'REGISTRY_APPEAL_UNDER_REVIEW',
      'Registry appeal taken under review',
      ctx,
    );
    return updated;
  }

  /** Internal: record the terminal decision on an appeal. */
  async decideAppeal(
    admin: AuthenticatedUser,
    id: string,
    dto: DecideRegistryAppealDto,
    ctx: RequestContext = {},
  ): Promise<RegistryAppeal> {
    const appeal = await this.requireStatus(id, ['SUBMITTED', 'UNDER_REVIEW']);
    const accepted = dto.decision === AppealDecision.ACCEPTED;

    // An ACCEPTED appeal may also pull the entry from the public registry.
    if (accepted && dto.unpublishEntry) {
      const entry = await this.prisma.registryEntry.findUnique({
        where: { id: appeal.registryEntryId },
      });
      if (entry?.status === 'PUBLISHED') {
        await this.registry.unpublish(admin, entry.id, ctx);
      }
    }

    const updated = await this.prisma.registryAppeal.update({
      where: { id: appeal.id },
      data: {
        status: accepted ? 'ACCEPTED' : 'REJECTED',
        reviewedByUserId: admin.userId,
        reviewedAt: new Date(),
        reviewNotes: dto.reviewNotes,
        resolutionAction: dto.resolutionAction,
      },
    });

    await this.logEvidence(
      updated,
      admin,
      'COMPLIANCE_OFFICER',
      accepted ? 'REGISTRY_APPEAL_ACCEPTED' : 'REGISTRY_APPEAL_REJECTED',
      accepted
        ? 'Registry appeal accepted by compliance review'
        : 'Registry appeal rejected by compliance review',
      ctx,
    );
    return updated;
  }

  private async requireStatus(
    id: string,
    allowed: RegistryAppealStatus[],
  ): Promise<RegistryAppeal> {
    const appeal = await this.prisma.registryAppeal.findUnique({ where: { id } });
    if (!appeal) {
      throw new NotFoundException('Registry appeal not found');
    }
    if (!allowed.includes(appeal.status)) {
      throw new BadRequestException(
        `Appeal status is ${appeal.status}; this action requires ${allowed.join(' or ')}`,
      );
    }
    return appeal;
  }

  private logEvidence(
    appeal: RegistryAppeal,
    actor: AuthenticatedUser,
    actorType: string,
    eventType: string,
    description: string,
    ctx: RequestContext,
  ): Promise<unknown> {
    return this.evidence.append({
      tenantId: null,
      actorId: actor.userId,
      actorType,
      entityType: 'REGISTRY_APPEAL',
      entityId: appeal.id,
      eventType,
      eventDescription: description,
      metadata: {
        status: appeal.status,
        appealType: appeal.appealType,
        registryEntryId: appeal.registryEntryId,
      },
      ipAddress: ctx.ip ?? null,
    });
  }
}
