import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticityCheck, AuthenticityCheckType, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { AuthenticityClient } from './authenticity.client';
import { AuthenticityRequest } from './authenticity.types';

const SNIPPET_LEN = 200;

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

  async runCheck(actor: AuthenticatedUser, req: AuthenticityRequest): Promise<AuthenticityCheck> {
    const session = await this.prisma.session.findUnique({ where: { id: req.sessionId } });
    if (!session) {
      throw new NotFoundException('Session not found');
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

    const verdict = await this.prisma.authenticityCheck.create({
      data: {
        sessionId: req.sessionId,
        checkType: req.checkType,
        result: output.result,
        score: output.score,
        modelVersion: output.modelVersion,
        source,
        metadata: (output.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
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
