import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, ScamMirrorSession, ScamMirrorStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { GuardianPauseService } from '../guardian-pause/guardian-pause.service';
import { RecordInputDto } from './dto/record-input.dto';
import { StartSessionDto } from './dto/start-session.dto';
import { sanitize } from './sanitizer';
import { Tactic, detectTactics } from './tactics';

interface Turn {
  turn: number;
  role: string;
  text: string;
  tacticsDetected: Tactic[];
  at: string;
}

/**
 * ScamMirror™ (Phase 9F). Safe simulation environment for users to
 * role-play scam conversations. Each turn is sanitized for real
 * credentials; tactics are detected and accumulated; the final session
 * row exports to Evidence Vault so the user (and the ScamScript Genome,
 * Phase 4) can learn from observed patterns.
 *
 * **Safety boundary** — if the sanitizer detects a real credential
 * (credit card / private key / mnemonic / SSN), the session is force-
 * ended with status ABORTED_REAL_CREDS and a Guardian Pause is pulled.
 * The user just demonstrated they're at live risk of leaking those
 * secrets; treating the simulation as if it were real protects them.
 */
@Injectable()
export class ScamMirrorService {
  private readonly logger = new Logger(ScamMirrorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
    private readonly guardianPause: GuardianPauseService,
  ) {}

  async start(user: AuthenticatedUser, dto: StartSessionDto): Promise<ScamMirrorSession> {
    return this.prisma.scamMirrorSession.create({
      data: {
        userId: user.userId,
        tenantId: user.tenantId,
        persona: dto.persona,
        scenario: dto.scenario,
        metadata: dto.metadata as never,
      },
    });
  }

  async recordInput(
    user: AuthenticatedUser,
    sessionId: string,
    dto: RecordInputDto,
  ): Promise<ScamMirrorSession> {
    const session = await this.requireActiveSession(user, sessionId);

    const verdict = sanitize(dto.text);
    if (!verdict.ok) {
      // Real credential detected. Abort the session, log evidence WITHOUT
      // the offending text (we never store what tripped the sanitizer),
      // and pull a Guardian Pause so the user gets visual feedback that
      // this is a real safety event.
      return this.abortForRealCreds(user, session, verdict.reason);
    }

    const tactics = detectTactics(dto.text);
    const existingTurns = readTurns(session);
    const newTurn: Turn = {
      turn: existingTurns.length + 1,
      role: dto.role,
      text: dto.text,
      tacticsDetected: tactics,
      at: new Date().toISOString(),
    };

    const cumulativeTactics = [...new Set<string>([...session.tacticsObserved, ...tactics])];

    return this.prisma.scamMirrorSession.update({
      where: { id: session.id },
      data: {
        turns: [...existingTurns, newTurn] as unknown as Prisma.InputJsonValue,
        tacticsObserved: cumulativeTactics,
      },
    });
  }

  async end(
    user: AuthenticatedUser,
    sessionId: string,
    learned: boolean,
  ): Promise<ScamMirrorSession> {
    const session = await this.requireActiveSession(user, sessionId);

    const status: ScamMirrorStatus = learned ? 'ENDED_LEARNED' : 'ENDED_ABANDONED';

    const ended = await this.prisma.scamMirrorSession.update({
      where: { id: session.id },
      data: {
        status,
        endedAt: new Date(),
        endReason: learned ? 'User completed the simulation' : 'User abandoned',
      },
    });

    const evidence = await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'SCAMMIRROR_SESSION',
      entityId: session.id,
      eventType: `SCAMMIRROR_${status}`,
      eventDescription: `ScamMirror ${session.persona} session ${status.toLowerCase()}`,
      metadata: {
        persona: session.persona,
        tacticsObserved: ended.tacticsObserved,
        turnCount: readTurns(ended).length,
        // The full transcript lives on the row; mirroring it into the
        // evidence summary would duplicate user-authored content and
        // make audit reads expensive.
      },
    });

    return this.prisma.scamMirrorSession.update({
      where: { id: session.id },
      data: { evidenceEventId: evidence.id },
    });
  }

  history(user: AuthenticatedUser, limit = 50): Promise<ScamMirrorSession[]> {
    return this.prisma.scamMirrorSession.findMany({
      where: { userId: user.userId },
      orderBy: { startedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  // ───────────────────────────────────────────────────────────────────────────

  private async requireActiveSession(
    user: AuthenticatedUser,
    sessionId: string,
  ): Promise<ScamMirrorSession> {
    const session = await this.prisma.scamMirrorSession.findFirst({
      where: { id: sessionId, userId: user.userId },
    });
    if (!session) {
      throw new NotFoundException('ScamMirror session not found');
    }
    if (session.status !== ('ACTIVE' as ScamMirrorStatus)) {
      throw new BadRequestException(`Session already ended (${session.status})`);
    }
    return session;
  }

  private async abortForRealCreds(
    user: AuthenticatedUser,
    session: ScamMirrorSession,
    reason: string,
  ): Promise<ScamMirrorSession> {
    const aborted = await this.prisma.scamMirrorSession.update({
      where: { id: session.id },
      data: {
        status: 'ABORTED_REAL_CREDS',
        endedAt: new Date(),
        endReason: `Sanitizer rejected input — ${reason}`,
      },
    });

    const evidence = await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'USER',
      entityType: 'SCAMMIRROR_SESSION',
      entityId: session.id,
      eventType: 'SCAMMIRROR_ABORTED_REAL_CREDS',
      eventDescription: `ScamMirror aborted — real ${reason} detected in input`,
      // NOTE: the offending text is never stored anywhere. We log only
      // the reason class.
      metadata: { reason, persona: session.persona },
    });

    // Pull Guardian Pause as a live protection signal.
    const pause = await this.guardianPause.start(user, {
      riskLevel: 'HIGH',
      triggerType: 'SECRECY',
      triggerSummary: 'You typed a real credential into a training simulation. Take a moment.',
      durationSeconds: 90,
      metadata: { scamMirrorSessionId: session.id, sanitizerReason: reason },
    });

    this.logger.warn(`ScamMirror ${session.id} aborted: ${reason} (pause=${pause.id})`);

    return this.prisma.scamMirrorSession.update({
      where: { id: aborted.id },
      data: {
        evidenceEventId: evidence.id,
        guardianPauseEventId: pause.id,
      },
    });
  }
}

function readTurns(session: ScamMirrorSession): Turn[] {
  // Prisma returns Json as `unknown`; the column is typed in the
  // migration as a JSONB array. Defensive default keeps a corrupted row
  // from crashing the read path.
  const raw = session.turns as unknown;
  return Array.isArray(raw) ? (raw as Turn[]) : [];
}
