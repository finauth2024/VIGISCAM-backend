import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FraudJourneyAssessment,
  PredictedNextMove,
  Prisma,
  RiskFusionAssessment,
  VictimStateAssessment,
} from '@prisma/client';
import { createHash } from 'crypto';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { fuseRiskScore } from './fusion';
import { InsightsClient } from './insights.client';
import { InsightHints } from './insights-stub';

const SNIPPET_LEN = 200;

export interface FuseRequest {
  sessionId: string;
  hints?: InsightHints;
}

export interface FuseResponse {
  fusion: RiskFusionAssessment;
  journey: FraudJourneyAssessment;
  victimState: VictimStateAssessment;
  predictedMove: PredictedNextMove;
}

/**
 * Risk Fusion v2 orchestrator (PDF §45). Runs the three Phase 6E AI insight
 * stubs against a session, persists each assessment, audits each AI call
 * (PDF non-negotiable #13), and produces a single fused RiskAssessment
 * combining them with the existing live risk score + authenticity verdicts.
 *
 * The insight engines run through InsightsClient (Phase 11B): when
 * `AI_SERVICE_URL` is configured the external Python workers answer and
 * each row is stamped source=EXTERNAL; otherwise the in-process stub
 * answers and the row is stamped source=STUB. Same toggle as the 6A NLP
 * / 6B embedding clients.
 */
@Injectable()
export class RiskFusionV2Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly insights: InsightsClient,
  ) {}

  async fuse(actor: AuthenticatedUser, req: FuseRequest): Promise<FuseResponse> {
    const session = await this.prisma.session.findUnique({
      where: { id: req.sessionId },
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const hints = req.hints ?? {};
    const inputDigest = createHash('sha256')
      .update(JSON.stringify({ sessionId: req.sessionId, hints }))
      .digest('hex');
    const inputSnippet = JSON.stringify(hints).slice(0, SNIPPET_LEN);

    // ── 1. Fraud Journey ──
    const journeyStart = Date.now();
    const journeyRes = await this.insights.assessJourney(hints);
    const journeyOut = journeyRes.output;
    const journey = await this.prisma.fraudJourneyAssessment.create({
      data: {
        sessionId: req.sessionId,
        stage: journeyOut.stage,
        confidence: journeyOut.confidence,
        modelVersion: journeyOut.modelVersion,
        source: journeyRes.source,
        evidence: journeyOut.evidence as unknown as Prisma.InputJsonValue,
      },
    });
    await this.prisma.aIDecision.create({
      data: {
        serviceKind: 'FRAUD_JOURNEY',
        modelVersion: journeyOut.modelVersion,
        source: journeyRes.source,
        entityType: 'SESSION',
        entityId: req.sessionId,
        inputDigest,
        inputSnippet,
        output: journeyOut as unknown as Prisma.InputJsonValue,
        confidence: journeyOut.confidence,
        durationMs: Date.now() - journeyStart,
      },
    });

    // ── 2. Victim State ──
    const victimStart = Date.now();
    const victimRes = await this.insights.assessVictimState(hints);
    const victimOut = victimRes.output;
    const victimState = await this.prisma.victimStateAssessment.create({
      data: {
        sessionId: req.sessionId,
        state: victimOut.state,
        confidence: victimOut.confidence,
        modelVersion: victimOut.modelVersion,
        source: victimRes.source,
        signals: victimOut.signals as unknown as Prisma.InputJsonValue,
      },
    });
    await this.prisma.aIDecision.create({
      data: {
        serviceKind: 'VICTIM_STATE',
        modelVersion: victimOut.modelVersion,
        source: victimRes.source,
        entityType: 'SESSION',
        entityId: req.sessionId,
        inputDigest,
        inputSnippet,
        output: victimOut as unknown as Prisma.InputJsonValue,
        confidence: victimOut.confidence,
        durationMs: Date.now() - victimStart,
      },
    });

    // ── 3. Predicted Next Move (state-machine over current stage) ──
    const predictStart = Date.now();
    const predictRes = await this.insights.predictNextMove(journeyOut.stage);
    const predictOut = predictRes.output;
    const predictedMove = await this.prisma.predictedNextMove.create({
      data: {
        sessionId: req.sessionId,
        action: predictOut.action,
        confidence: predictOut.confidence,
        modelVersion: predictOut.modelVersion,
        source: predictRes.source,
        rationale: predictOut.rationale,
      },
    });
    await this.prisma.aIDecision.create({
      data: {
        serviceKind: 'PREDICTED_NEXT_MOVE',
        modelVersion: predictOut.modelVersion,
        source: predictRes.source,
        entityType: 'SESSION',
        entityId: req.sessionId,
        inputDigest,
        inputSnippet,
        output: predictOut as unknown as Prisma.InputJsonValue,
        confidence: predictOut.confidence,
        durationMs: Date.now() - predictStart,
      },
    });

    // ── 4. Count authenticity FAILures on this session ──
    const authenticityFailures = await this.prisma.authenticityCheck.count({
      where: { sessionId: req.sessionId, result: 'FAIL' },
    });

    // ── 5. Fuse ──
    const fusion = fuseRiskScore({
      baseScore: session.riskScore,
      stage: journeyOut.stage,
      victimState: victimOut.state,
      predictedAction: predictOut.action,
      authenticityFailures,
    });

    const fusionRow = await this.prisma.riskFusionAssessment.create({
      data: {
        sessionId: req.sessionId,
        fusedScore: fusion.fusedScore,
        fusedLevel: fusion.fusedLevel,
        breakdown: fusion.breakdown as unknown as Prisma.InputJsonValue,
        fusedVersion: fusion.fusedVersion,
      },
    });

    return { fusion: fusionRow, journey, victimState, predictedMove };
  }

  async getLatestForSession(sessionId: string) {
    const latest = await this.prisma.riskFusionAssessment.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest) throw new NotFoundException('No risk fusion assessment for this session');
    return latest;
  }

  list(sessionId?: string, limit = 100) {
    return this.prisma.riskFusionAssessment.findMany({
      where: sessionId ? { sessionId } : {},
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }
}
