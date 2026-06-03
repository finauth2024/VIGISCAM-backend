import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticityCheck, AuthenticityCheckType, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { AuthenticityClient } from './authenticity.client';
import { AuthenticityRequest } from './authenticity.types';
import { RequestAuthenticityCheckDto } from './dto/request-authenticity-check.dto';

const SNIPPET_LEN = 200;

/** Checks that require media; without it the verdict is INCONCLUSIVE. */
const IMAGE_CHECKS: AuthenticityCheckType[] = ['LIVE_FACE_SEAL', 'SCENE_SEAL', 'ANTI_FAKE_VIDEO'];
const VOICE_CHECKS: AuthenticityCheckType[] = ['VOICE_MATCH_SEAL'];
const MEDIA_KEYS = [
  'imageBase64',
  'imageUrl',
  'frameBase64',
  'frameUrl',
  'audioBase64',
  'audioUrl',
  'evidenceRef',
] as const;

/**
 * Runs Authenticity Verification Suite checks against a session, persists the
 * verdict, audits it as an AIDecision (PDF non-negotiable #13), and writes an
 * AUTHENTICITY_VERDICT event to the Evidence Vault.
 */
@Injectable()
export class AuthenticityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly client: AuthenticityClient,
  ) {}

  async runCheck(
    actor: AuthenticatedUser,
    dto: RequestAuthenticityCheckDto,
  ): Promise<AuthenticityCheck> {
    const session = await this.prisma.session.findUnique({ where: { id: dto.sessionId } });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    // CP-4 — fold the first-class media fields into the worker payload.
    const media: Record<string, unknown> = {};
    for (const k of MEDIA_KEYS) {
      if (dto[k] != null) media[k] = dto[k];
    }
    const payload: Record<string, unknown> = { ...(dto.payload ?? {}), ...media };
    const req: AuthenticityRequest = {
      checkType: dto.checkType,
      sessionId: dto.sessionId,
      payload,
    };

    // CP-4 — if an ML check is run with no media, return INCONCLUSIVE honestly
    // and store the reason rather than calling the worker with nothing.
    const noImage =
      IMAGE_CHECKS.includes(dto.checkType) &&
      !payload.imageBase64 &&
      !payload.imageUrl &&
      !payload.frameBase64 &&
      !payload.frameUrl;
    const noAudio =
      VOICE_CHECKS.includes(dto.checkType) && !payload.audioBase64 && !payload.audioUrl;
    if (noImage || noAudio) {
      return this.persistInconclusive(actor, session.tenantId, req, noImage ? 'image' : 'audio');
    }

    const start = Date.now();
    const { output, source } = await this.client.run(req);
    const durationMs = Date.now() - start;

    const inputCanonical = JSON.stringify({
      checkType: req.checkType,
      sessionId: req.sessionId,
      payload: req.payload ?? null,
    });
    const inputDigest = createHash('sha256').update(inputCanonical).digest('hex');

    // Fold the worker's decision envelope (reason codes, risk score, tier,
    // requiresHumanReview, …) into the verdict metadata so it's discoverable
    // on the verdict row, not only on the AIDecision audit row.
    const verdictMetadata =
      output.metadata || output.decision
        ? { ...(output.metadata ?? {}), ...(output.decision ? { decision: output.decision } : {}) }
        : Prisma.JsonNull;

    const verdict = await this.prisma.authenticityCheck.create({
      data: {
        sessionId: req.sessionId,
        checkType: req.checkType,
        result: output.result,
        score: output.score,
        modelVersion: output.modelVersion,
        source,
        metadata: verdictMetadata as Prisma.InputJsonValue,
        requestedByUserId: actor.userId,
      },
    });

    await this.prisma.aIDecision.create({
      data: {
        serviceKind: `AUTHENTICITY_${req.checkType}`,
        modelVersion: output.modelVersion,
        source,
        entityType: 'SESSION',
        entityId: req.sessionId,
        inputDigest,
        inputSnippet: inputCanonical.slice(0, SNIPPET_LEN),
        output: output as unknown as Prisma.InputJsonValue,
        confidence: output.score,
        durationMs,
      },
    });

    await this.evidence.append({
      tenantId: session.tenantId,
      actorId: actor.userId,
      actorType: this.actorTypeFor(actor),
      entityType: 'SESSION',
      entityId: session.id,
      eventType: `AUTHENTICITY_${req.checkType}`,
      eventDescription: `${req.checkType} verdict: ${output.result} (${output.score})`,
      metadata: {
        checkType: req.checkType,
        result: output.result,
        score: output.score,
        modelVersion: output.modelVersion,
        source,
      },
    });

    return verdict;
  }

  /**
   * CP-4 — persist an honest INCONCLUSIVE verdict when an ML check was run
   * without the media it needs, recording the reason on the verdict + audit.
   */
  private async persistInconclusive(
    actor: AuthenticatedUser,
    tenantId: string,
    req: AuthenticityRequest,
    missing: 'image' | 'audio',
  ): Promise<AuthenticityCheck> {
    const reason = `No ${missing} media supplied for ${req.checkType}; cannot run inference.`;
    const verdict = await this.prisma.authenticityCheck.create({
      data: {
        sessionId: req.sessionId,
        checkType: req.checkType,
        result: 'INCONCLUSIVE',
        score: 0,
        modelVersion: 'no-media',
        source: 'STUB',
        metadata: { check: req.checkType, reason, missingMedia: missing } as Prisma.InputJsonValue,
        requestedByUserId: actor.userId,
      },
    });
    await this.evidence
      .append({
        tenantId,
        actorId: actor.userId,
        actorType: this.actorTypeFor(actor),
        entityType: 'SESSION',
        entityId: req.sessionId,
        eventType: `AUTHENTICITY_${req.checkType}`,
        eventDescription: `${req.checkType} verdict: INCONCLUSIVE (${reason})`,
        metadata: { checkType: req.checkType, result: 'INCONCLUSIVE', reason, source: 'STUB' },
      })
      .catch(() => undefined);
    return verdict;
  }

  list(sessionId?: string, checkType?: string, limit = 100) {
    const where: Prisma.AuthenticityCheckWhereInput = {};
    if (sessionId) where.sessionId = sessionId;
    if (checkType && (Object.values(AuthenticityCheckType) as string[]).includes(checkType)) {
      where.checkType = checkType as AuthenticityCheckType;
    }
    return this.prisma.authenticityCheck.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }

  async get(id: string): Promise<AuthenticityCheck> {
    const verdict = await this.prisma.authenticityCheck.findUnique({ where: { id } });
    if (!verdict) throw new NotFoundException('Authenticity verdict not found');
    return verdict;
  }

  private actorTypeFor(actor: AuthenticatedUser): string {
    if (actor.role === 'SUPER_ADMIN' || actor.role === 'COMPLIANCE_OFFICER') return 'ADMIN';
    if (actor.role === 'REVIEWER') return 'REVIEWER';
    return 'STAFF';
  }
}
