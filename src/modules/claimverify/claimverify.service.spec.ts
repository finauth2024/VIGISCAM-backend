import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClaimVerifyUserDecision } from './dto/decide-claim.dto';
import { ClaimVerifyService } from './claimverify.service';

function makePrisma(opts: {
  priorContinueCount?: number;
  existing?: Record<string, unknown> | null;
}) {
  const created: Array<Record<string, unknown>> = [];
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  let nextId = 1;
  return {
    raw: {
      claimVerification: {
        count: jest.fn(async () => opts.priorContinueCount ?? 0),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `claim-${nextId++}`, decision: 'PENDING', ...data };
          created.push(row);
          return row;
        }),
        findFirst: jest.fn(async () => opts.existing ?? null),
        update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push(args);
          return { id: args.where.id, ...opts.existing, ...args.data };
        }),
      },
    } as never,
    created,
    updates,
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

function makeGuardianPause() {
  const started: Array<Record<string, unknown>> = [];
  return {
    raw: {
      start: jest.fn(async (_u: unknown, dto: Record<string, unknown>) => {
        started.push(dto);
        return { id: `pause-${started.length}` };
      }),
    } as never,
    started,
  };
}

function makeTcr() {
  const requested: Array<Record<string, unknown>> = [];
  return {
    raw: {
      requestReview: jest.fn(async (input: Record<string, unknown>) => {
        requested.push(input);
        return { id: `tcr-${requested.length}` };
      }),
    } as never,
    requested,
  };
}

// Permissive enforcement mock (CP-2 enforcement is tested in
// protection-policy.service.spec.ts); never blocks here.
function makeEnforcement() {
  const permissive = {
    continueAnywayAllowed: true,
    trustedContactReviewRequired: false,
    guardianPauseDurationSeconds: 30,
    reasons: [] as string[],
  };
  return {
    raw: {
      enforceDecision: jest.fn(async () => permissive),
      evaluate: jest.fn(async () => permissive),
    } as never,
  };
}

function makeRiskEvents() {
  return { raw: { record: jest.fn(async () => ({ id: 're-1' })) } as never };
}

const USER = {
  userId: 'user-1',
  email: 'u@example.com',
  tenantId: 'tenant-A',
  role: 'INDIVIDUAL',
} as never;

describe('ClaimVerifyService.verify', () => {
  it('a JOB claim with no signals is LOW, no Guardian Pause', async () => {
    const prisma = makePrisma({});
    const gp = makeGuardianPause();
    const svc = new ClaimVerifyService(prisma.raw, makeEvidence().raw, gp.raw, makeTcr().raw, makeEnforcement().raw, makeRiskEvents().raw);

    await svc.verify(USER, {
      claimType: 'JOB',
      subject: { company: 'Acme', email: 'careers@acme.test' },
    });

    expect(prisma.created[0]).toMatchObject({
      claimType: 'JOB',
      riskLevel: 'LOW',
    });
    expect(gp.started).toHaveLength(0);
  });

  it('ROMANCE + image reuse + urgency + secrecy + payment pressure is CRITICAL', async () => {
    const prisma = makePrisma({});
    const gp = makeGuardianPause();
    const evidence = makeEvidence();
    const svc = new ClaimVerifyService(prisma.raw, evidence.raw, gp.raw, makeTcr().raw, makeEnforcement().raw, makeRiskEvents().raw);

    await svc.verify(USER, {
      claimType: 'ROMANCE',
      subject: { name: 'James Bond', email: '...@example.com' },
      imageReuseDetected: true,
      urgencyDetected: true,
      secrecyDetected: true,
      paymentPressure: true,
    });

    expect(prisma.created[0]).toMatchObject({ riskLevel: 'CRITICAL' });
    expect(gp.started).toHaveLength(1);
    expect(gp.started[0]).toMatchObject({
      triggerType: 'SUSPICIOUS_CLAIM',
      riskLevel: 'CRITICAL',
    });
    // Evidence row references the entity but doesn't duplicate the subject PII.
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'CLAIM_VERIFICATION_OPENED',
    });
  });

  it('feeds prior CONTINUED_ANYWAY count into the score', async () => {
    const prisma = makePrisma({ priorContinueCount: 3 });
    const svc = new ClaimVerifyService(
      prisma.raw,
      makeEvidence().raw,
      makeGuardianPause().raw,
      makeTcr().raw,
      makeEnforcement().raw,
      makeRiskEvents().raw,
    );

    await svc.verify(USER, {
      claimType: 'INVESTMENT',
      subject: { name: 'Glass Investments' },
    });

    expect(prisma.created[0]).toMatchObject({ priorWarningsCount: 3 });
  });

  it('persists scamPhraseScore + domainAgeDays when provided', async () => {
    const prisma = makePrisma({});
    const svc = new ClaimVerifyService(
      prisma.raw,
      makeEvidence().raw,
      makeGuardianPause().raw,
      makeTcr().raw,
      makeEnforcement().raw,
      makeRiskEvents().raw,
    );
    await svc.verify(USER, {
      claimType: 'OIL_PROJECT',
      subject: { website: 'oil-project.test' },
      domainAgeDays: 5,
      scamPhraseScore: 85,
    });
    expect(prisma.created[0]).toMatchObject({
      domainAgeDays: 5,
      scamPhraseScore: 85,
    });
  });
});

describe('ClaimVerifyService.decide', () => {
  it('throws NotFound when the row does not exist or belongs to another user', async () => {
    const svc = new ClaimVerifyService(
      makePrisma({ existing: null }).raw,
      makeEvidence().raw,
      makeGuardianPause().raw,
      makeTcr().raw,
      makeEnforcement().raw,
      makeRiskEvents().raw,
    );
    await expect(
      svc.decide(USER, 'nope', { decision: ClaimVerifyUserDecision.TRUSTED }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequest when the row is already decided', async () => {
    const svc = new ClaimVerifyService(
      makePrisma({
        existing: { id: 'claim-1', decision: 'TRUSTED' },
      }).raw,
      makeEvidence().raw,
      makeGuardianPause().raw,
      makeTcr().raw,
      makeEnforcement().raw,
      makeRiskEvents().raw,
    );
    await expect(
      svc.decide(USER, 'claim-1', { decision: ClaimVerifyUserDecision.TRUSTED }),
    ).rejects.toThrow(BadRequestException);
  });

  it('on REJECTED, records decision + CLAIM_VERIFICATION_REJECTED evidence', async () => {
    const prisma = makePrisma({
      existing: { id: 'claim-1', decision: 'PENDING' },
    });
    const evidence = makeEvidence();
    const svc = new ClaimVerifyService(
      prisma.raw,
      evidence.raw,
      makeGuardianPause().raw,
      makeTcr().raw,
      makeEnforcement().raw,
      makeRiskEvents().raw,
    );

    await svc.decide(USER, 'claim-1', {
      decision: ClaimVerifyUserDecision.REJECTED,
      notes: 'business does not exist at the claimed address',
    });

    expect(prisma.updates[0].data).toMatchObject({
      decision: 'REJECTED',
      decisionNotes: 'business does not exist at the claimed address',
    });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'CLAIM_VERIFICATION_REJECTED',
    });
  });
});
