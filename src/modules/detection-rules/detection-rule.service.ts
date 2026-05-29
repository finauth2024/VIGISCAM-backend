import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DetectionRule,
  DetectionRuleStatus,
  DetectionRuleType,
  MembershipRole,
  Prisma,
} from '@prisma/client';
import { AuthenticatedUser, RequestContext } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { CreateDetectionRuleDto } from './dto/create-detection-rule.dto';
import { UpdateDetectionRuleDto } from './dto/update-detection-rule.dto';
import { UpdateDetectionRuleStatusDto } from './dto/update-detection-rule-status.dto';
import { canTransition, isEditable } from './detection-rule.transitions';

/** Roles allowed to push a rule into ACTIVE (the no-auto-activation gate). */
const ACTIVATION_ROLES: MembershipRole[] = [
  MembershipRole.SUPER_ADMIN,
  MembershipRole.COMPLIANCE_OFFICER,
];

/**
 * Detection-rule management (PDF §33, §45 DetectionRuleService). Manual rule
 * authoring + lifecycle. AI-generated suggestions land here as DRAFT in Phase
 * 4C — even suggestions can never auto-activate. Every change is written to
 * the Evidence Vault.
 */
@Injectable()
export class DetectionRuleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
  ) {}

  /** Create a new rule. Always lands as DRAFT. */
  create(
    actor: AuthenticatedUser,
    dto: CreateDetectionRuleDto,
    ctx: RequestContext = {},
  ): Promise<DetectionRule> {
    return this.createInternal(actor, dto, ctx, 'RULE_CREATED', 'Detection rule created as DRAFT');
  }

  /**
   * Create a rule from an AI-generated suggestion (Phase 4C). Same DB write as
   * `create`, but emits RULE_SUGGESTED so the audit trail distinguishes
   * reviewer-authored rules from suggestions.
   */
  createSuggestion(
    actor: AuthenticatedUser,
    dto: CreateDetectionRuleDto,
    ctx: RequestContext = {},
  ): Promise<DetectionRule> {
    return this.createInternal(
      actor,
      dto,
      ctx,
      'RULE_SUGGESTED',
      'Detection rule suggested from verified intelligence (DRAFT)',
    );
  }

  private async createInternal(
    actor: AuthenticatedUser,
    dto: CreateDetectionRuleDto,
    ctx: RequestContext,
    eventType: string,
    description: string,
  ): Promise<DetectionRule> {
    const rule = await this.prisma.detectionRule.create({
      data: {
        name: dto.name,
        description: dto.description,
        ruleType: dto.ruleType,
        pattern: dto.pattern as Prisma.InputJsonValue,
        category: dto.category,
        severity: dto.severity ?? 'MEDIUM',
        status: 'DRAFT',
        sourceClusterId: dto.sourceClusterId,
        createdByUserId: actor.userId,
      },
    });
    await this.logEvidence(rule, actor, eventType, description, ctx);
    return rule;
  }

  list(status?: string, ruleType?: string): Promise<DetectionRule[]> {
    const where: Prisma.DetectionRuleWhereInput = {};
    if ((Object.values(DetectionRuleStatus) as string[]).includes(status ?? '')) {
      where.status = status as DetectionRuleStatus;
    }
    if ((Object.values(DetectionRuleType) as string[]).includes(ruleType ?? '')) {
      where.ruleType = ruleType as DetectionRuleType;
    }
    return this.prisma.detectionRule.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  async get(id: string): Promise<DetectionRule> {
    const rule = await this.prisma.detectionRule.findUnique({ where: { id } });
    if (!rule) {
      throw new NotFoundException('Detection rule not found');
    }
    return rule;
  }

  /** Edit a rule's authoring fields. Blocked for ACTIVE / RETIRED rules. */
  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateDetectionRuleDto,
    ctx: RequestContext = {},
  ): Promise<DetectionRule> {
    const rule = await this.get(id);
    if (!isEditable(rule.status)) {
      throw new BadRequestException(
        `Cannot edit a rule in status ${rule.status} — disable it first, edit, then re-test.`,
      );
    }
    const data: Prisma.DetectionRuleUpdateInput = {
      version: { increment: 1 },
    };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.pattern !== undefined) data.pattern = dto.pattern as Prisma.InputJsonValue;
    if (dto.category !== undefined) data.category = dto.category;
    if (dto.severity !== undefined) data.severity = dto.severity;

    const updated = await this.prisma.detectionRule.update({ where: { id }, data });
    await this.logEvidence(
      updated,
      actor,
      'RULE_UPDATED',
      `Detection rule edited (v${updated.version})`,
      ctx,
    );
    return updated;
  }

  /**
   * Transition a rule to a new lifecycle status. Validates the transition is
   * legal (no DRAFT -> ACTIVE) and gates ACTIVE moves on admin / compliance.
   */
  async updateStatus(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateDetectionRuleStatusDto,
    ctx: RequestContext = {},
  ): Promise<DetectionRule> {
    const rule = await this.get(id);
    const target = dto.status;

    if (!canTransition(rule.status, target)) {
      throw new BadRequestException(
        `Cannot move a rule from ${rule.status} to ${target}` +
          ' — this is not a legal lifecycle transition (PDF §33).',
      );
    }
    if (target === 'ACTIVE' && !ACTIVATION_ROLES.includes(actor.role)) {
      throw new ForbiddenException(
        'Activating a detection rule requires SUPER_ADMIN or COMPLIANCE_OFFICER.',
      );
    }

    const data: Prisma.DetectionRuleUpdateInput = { status: target };
    if (target === 'ACTIVE') {
      data.activatedByUserId = actor.userId;
      data.activatedAt = new Date();
      data.disabledAt = null;
    }
    if (target === 'DISABLED') {
      data.disabledAt = new Date();
    }
    if (target === 'RETIRED') {
      data.retiredAt = new Date();
    }

    const updated = await this.prisma.detectionRule.update({ where: { id }, data });
    await this.logEvidence(
      updated,
      actor,
      `RULE_${target}`,
      dto.reason ?? `Detection rule moved to ${target}`,
      ctx,
    );
    return updated;
  }

  /** Reflect who actually acted in the audit trail (admin vs reviewer). */
  private actorTypeFor(role: MembershipRole): string {
    if (role === MembershipRole.SUPER_ADMIN || role === MembershipRole.COMPLIANCE_OFFICER) {
      return 'ADMIN';
    }
    if (role === MembershipRole.REVIEWER) {
      return 'REVIEWER';
    }
    return 'STAFF';
  }

  private logEvidence(
    rule: DetectionRule,
    actor: AuthenticatedUser,
    eventType: string,
    description: string,
    ctx: RequestContext,
  ): Promise<unknown> {
    return this.evidence.append({
      tenantId: null,
      actorId: actor.userId,
      actorType: this.actorTypeFor(actor.role),
      entityType: 'DETECTION_RULE',
      entityId: rule.id,
      eventType,
      eventDescription: description,
      metadata: {
        status: rule.status,
        ruleType: rule.ruleType,
        version: rule.version,
      },
      ipAddress: ctx.ip ?? null,
    });
  }
}
