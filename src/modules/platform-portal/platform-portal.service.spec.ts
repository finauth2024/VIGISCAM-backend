import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlatformModerationDecision } from './dto/moderation-decision.dto';
import { PlatformQueueRiskFilter } from './dto/moderation-queue-query.dto';
import { PlatformPortalService } from './platform-portal.service';

function makePrisma(
  opts: {
    claims?: Array<Record<string, unknown>>;
    groomings?: Array<Record<string, unknown>>;
    claimRow?: Record<string, unknown> | null;
    existingDecision?: Record<string, unknown> | null;
  } = {},
) {
  const createdGrooming: Array<Record<string, unknown>> = [];
  const updatedGrooming: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const createdDecision: Array<Record<string, unknown>> = [];
  const updatedDecision: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  let lastGroomingRow: Record<string, unknown> | null = null;
  let lastDecisionRow: Record<string, unknown> | null = null;
  return {
    raw: {
      claimVerification: {
        findMany: jest.fn(async () => opts.claims ?? []),
        findUnique: jest.fn(async () => opts.claimRow ?? null),
      },
      groomingCheckScore: {
        findMany: jest.fn(async () => opts.groomings ?? []),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          lastGroomingRow = { id: 'grm-1', ...data };
          createdGrooming.push(lastGroomingRow);
          return lastGroomingRow;
        }),
        update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updatedGrooming.push(args);
          lastGroomingRow = { ...(lastGroomingRow ?? {}), ...args.data };
          return lastGroomingRow;
        }),
      },
      platformModerationDecision: {
        findUnique: jest.fn(async () => opts.existingDecision ?? null),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          lastDecisionRow = { id: 'mod-1', ...data };
          createdDecision.push(lastDecisionRow);
          return lastDecisionRow;
        }),
        update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updatedDecision.push(args);
          lastDecisionRow = { ...(lastDecisionRow ?? {}), ...args.data };
          return lastDecisionRow;
        }),
      },
    } as never,
    createdGrooming,
    updatedGrooming,
    createdDecision,
    updatedDecision,
  };
}

function makeEvidence() {
  const appended: Array<Record<string, unknown>> = [];
  let i = 1;
  return {
    raw: {
      append: jest.fn(async (input: Record<string, unknown>) => {
        const row = { id: `ev-${i++}`, ...input };
        appended.push(row);
        return row;
      }),
    } as never,
    appended,
  };
}

const MOD = {
  userId: 'mod-1',
  email: 'm@platform.example',
  tenantId: 'platform-tenant-A',
  role: 'PLATFORM_MODERATOR',
} as never;

describe('PlatformPortalService.getModerationQueue', () => {
  it('filters by minRiskLevel and limits both lists', async () => {
    const prisma = makePrisma({
      claims: [
        {
          id: 'c-1',
          userId: 'u-1',
          claimType: 'ROMANCE',
          riskScore: 70,
          riskLevel: 'HIGH',
          decision: 'PENDING',
          createdAt: new Date(),
        },
      ],
      groomings: [
        {
          id: 'g-1',
          moderatorUserId: 'mod-1',
          subjectReference: 'conv-abc',
          ageGapSignal: 'AGE_GAP_LARGE',
          minorSuspected: false,
          riskScore: 65,
          riskLevel: 'HIGH',
          recommendedAction: 'HARD_INTERVENE',
          createdAt: new Date(),
        },
      ],
    });
    const svc = new PlatformPortalService(prisma.raw, makeEvidence().raw);
    const out = await svc.getModerationQueue(MOD, { minRiskLevel: PlatformQueueRiskFilter.HIGH });
    expect(out.claimVerifications).toHaveLength(1);
    expect(out.groomingChecks).toHaveLength(1);
    const callArgs = (prisma.raw as never as { claimVerification: { findMany: jest.Mock } })
      .claimVerification.findMany.mock.calls[0][0];
    expect(callArgs.where.tenantId).toBe('platform-tenant-A');
    expect(callArgs.where.riskLevel.in).toEqual(['HIGH', 'CRITICAL']);
  });

  it('defaults to MEDIUM+ when no filter is given', async () => {
    const prisma = makePrisma();
    const svc = new PlatformPortalService(prisma.raw, makeEvidence().raw);
    await svc.getModerationQueue(MOD, {});
    const callArgs = (prisma.raw as never as { claimVerification: { findMany: jest.Mock } })
      .claimVerification.findMany.mock.calls[0][0];
    expect(callArgs.where.riskLevel.in).toEqual(['MEDIUM', 'HIGH', 'CRITICAL']);
  });
});

describe('PlatformPortalService.groomingCheck', () => {
  it('scores, persists, links evidence, returns scoring', async () => {
    const prisma = makePrisma();
    const evidence = makeEvidence();
    const svc = new PlatformPortalService(prisma.raw, evidence.raw);
    const out = await svc.groomingCheck(MOD, {
      ageGapSignal: 'ADULT_TO_SUSPECTED_MINOR',
    } as never);
    expect(prisma.createdGrooming[0]).toMatchObject({
      tenantId: 'platform-tenant-A',
      moderatorUserId: 'mod-1',
      riskLevel: 'CRITICAL',
      recommendedAction: 'ESCALATE_TO_TRUST_AND_SAFETY',
    });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'PLATFORM_PORTAL_GROOMING_SCORED',
      tenantId: 'platform-tenant-A',
    });
    expect(prisma.updatedGrooming[0].data.evidenceEventId).toBe('ev-1');
    expect(out.scoring.recommendedAction).toBe('ESCALATE_TO_TRUST_AND_SAFETY');
  });

  it('a minorSuspected + payment-request flow stamps ESCALATE_TO_LAW_ENFORCEMENT', async () => {
    const prisma = makePrisma();
    const svc = new PlatformPortalService(prisma.raw, makeEvidence().raw);
    const out = await svc.groomingCheck(MOD, {
      ageGapSignal: 'UNKNOWN',
      minorSuspected: true,
      paymentRequestDetected: true,
    } as never);
    expect(out.scoring.recommendedAction).toBe('ESCALATE_TO_LAW_ENFORCEMENT');
    expect(prisma.createdGrooming[0]).toMatchObject({
      recommendedAction: 'ESCALATE_TO_LAW_ENFORCEMENT',
    });
  });
});

describe('PlatformPortalService.decideOnClaim', () => {
  it('throws NotFound when the claim does not exist', async () => {
    const svc = new PlatformPortalService(makePrisma({ claimRow: null }).raw, makeEvidence().raw);
    await expect(
      svc.decideOnClaim(MOD, 'no-such', {
        decision: PlatformModerationDecision.REMOVE_CONTENT,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFound when the claim is owned by another tenant', async () => {
    const svc = new PlatformPortalService(
      makePrisma({
        claimRow: {
          id: 'c-1',
          tenantId: 'platform-tenant-B',
          userId: 'u-1',
          claimType: 'ROMANCE',
          riskLevel: 'HIGH',
        },
      }).raw,
      makeEvidence().raw,
    );
    await expect(
      svc.decideOnClaim(MOD, 'c-1', {
        decision: PlatformModerationDecision.REMOVE_CONTENT,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequest when the platform has already moderated this claim', async () => {
    const svc = new PlatformPortalService(
      makePrisma({
        claimRow: {
          id: 'c-1',
          tenantId: 'platform-tenant-A',
          userId: 'u-1',
          claimType: 'ROMANCE',
          riskLevel: 'HIGH',
        },
        existingDecision: { id: 'mod-old' },
      }).raw,
      makeEvidence().raw,
    );
    await expect(
      svc.decideOnClaim(MOD, 'c-1', {
        decision: PlatformModerationDecision.REMOVE_CONTENT,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('persists a fresh decision and writes a PLATFORM_PORTAL_MOD_<decision> event', async () => {
    const prisma = makePrisma({
      claimRow: {
        id: 'c-1',
        tenantId: 'platform-tenant-A',
        userId: 'u-1',
        claimType: 'ROMANCE',
        riskLevel: 'HIGH',
      },
    });
    const evidence = makeEvidence();
    const svc = new PlatformPortalService(prisma.raw, evidence.raw);
    await svc.decideOnClaim(MOD, 'c-1', {
      decision: PlatformModerationDecision.SUSPEND_USER,
      notes: 'multiple high-risk signals',
    });
    expect(prisma.createdDecision[0]).toMatchObject({
      tenantId: 'platform-tenant-A',
      claimVerificationId: 'c-1',
      decision: 'SUSPEND_USER',
      notes: 'multiple high-risk signals',
    });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'PLATFORM_PORTAL_MOD_SUSPEND_USER',
    });
    expect(prisma.updatedDecision[0].data.evidenceEventId).toBe('ev-1');
  });
});
