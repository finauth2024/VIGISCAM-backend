import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GiftCardGuardUserDecision } from './dto/decide-giftcard.dto';
import { GiftCardGuardService } from './giftcardguard.service';

function makePrisma(opts: {
  priorContinueCount?: number;
  existing?: Record<string, unknown> | null;
}) {
  const created: Array<Record<string, unknown>> = [];
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  let nextId = 1;
  return {
    raw: {
      giftCardWarning: {
        count: jest.fn(async () => opts.priorContinueCount ?? 0),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `warn-${nextId++}`, decision: 'PENDING', ...data };
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

describe('GiftCardGuardService.scan', () => {
  it('opens a row, scores it, writes evidence, links id back', async () => {
    const prisma = makePrisma({});
    const evidence = makeEvidence();
    const gp = makeGuardianPause();
    const svc = new GiftCardGuardService(prisma.raw, evidence.raw, gp.raw, makeTcr().raw, makeEnforcement().raw, makeRiskEvents().raw);

    const row = await svc.scan(USER, {
      cardBrand: 'Amazon',
      denominationMinor: 50_000,
    });

    expect(row.id).toBe('warn-1');
    expect(prisma.created[0]).toMatchObject({
      cardBrand: 'Amazon',
      riskLevel: 'LOW', // baseline 25 only → LOW
    });
    expect(evidence.appended).toHaveLength(1);
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'GIFTCARD_WARNING_OPENED',
      entityType: 'GIFTCARD_WARNING',
    });
    expect(prisma.updates[0].data).toEqual({
      evidenceEventId: 'ev-1',
      guardianPauseEventId: null,
    });
    expect(gp.started).toHaveLength(0);
  });

  it('on HIGH risk (code reveal + impersonation), pulls Guardian Pause', async () => {
    const prisma = makePrisma({});
    const gp = makeGuardianPause();
    const svc = new GiftCardGuardService(prisma.raw, makeEvidence().raw, gp.raw, makeTcr().raw, makeEnforcement().raw, makeRiskEvents().raw);

    await svc.scan(USER, {
      codeRevealRequested: true,
      impersonationType: 'TECH_SUPPORT',
    });

    // 25 + 25 + 35 = 85 → HIGH
    expect(prisma.created[0]).toMatchObject({ riskLevel: 'HIGH' });
    expect(gp.started).toHaveLength(1);
    expect(gp.started[0]).toMatchObject({
      triggerType: 'GIFT_CARD_REVEAL',
      riskLevel: 'HIGH',
    });
    expect(prisma.updates[0].data).toEqual({
      evidenceEventId: 'ev-1',
      guardianPauseEventId: 'pause-1',
    });
  });

  it('on CRITICAL risk, pulls Guardian Pause with riskLevel CRITICAL', async () => {
    const prisma = makePrisma({});
    const gp = makeGuardianPause();
    const svc = new GiftCardGuardService(prisma.raw, makeEvidence().raw, gp.raw, makeTcr().raw, makeEnforcement().raw, makeRiskEvents().raw);

    await svc.scan(USER, {
      codeRevealRequested: true,
      photoOfCodeRequested: true,
      impersonationType: 'GOVERNMENT',
      urgencyDetected: true,
      secrecyDetected: true,
    });

    // 25 + 25 + 25 + 35 + 15 + 15 = 140 → caps 100 → CRITICAL
    expect(prisma.created[0]).toMatchObject({ riskLevel: 'CRITICAL' });
    expect(gp.started[0]).toMatchObject({ riskLevel: 'CRITICAL' });
  });

  it('feeds prior CONTINUED_ANYWAY count into the score', async () => {
    const prisma = makePrisma({ priorContinueCount: 4 });
    const svc = new GiftCardGuardService(
      prisma.raw,
      makeEvidence().raw,
      makeGuardianPause().raw,
      makeTcr().raw,
      makeEnforcement().raw,
      makeRiskEvents().raw,
    );

    await svc.scan(USER, {});

    // 25 (baseline) + 20 (4 priors capped at 20) = 45 → MEDIUM
    expect(prisma.created[0]).toMatchObject({
      priorWarningsCount: 4,
      riskLevel: 'MEDIUM',
    });
  });
});

describe('GiftCardGuardService.decide', () => {
  it('throws NotFound for a row that does not belong to the user', async () => {
    const svc = new GiftCardGuardService(
      makePrisma({ existing: null }).raw,
      makeEvidence().raw,
      makeGuardianPause().raw,
      makeTcr().raw,
      makeEnforcement().raw,
      makeRiskEvents().raw,
    );
    await expect(
      svc.decide(USER, 'nope', {
        decision: GiftCardGuardUserDecision.AVOIDED,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequest when the row is already decided', async () => {
    const svc = new GiftCardGuardService(
      makePrisma({
        existing: { id: 'warn-1', decision: 'AVOIDED' },
      }).raw,
      makeEvidence().raw,
      makeGuardianPause().raw,
      makeTcr().raw,
      makeEnforcement().raw,
      makeRiskEvents().raw,
    );
    await expect(
      svc.decide(USER, 'warn-1', {
        decision: GiftCardGuardUserDecision.AVOIDED,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('on AVOIDED, records decision + evidence', async () => {
    const prisma = makePrisma({
      existing: { id: 'warn-1', decision: 'PENDING' },
    });
    const evidence = makeEvidence();
    const svc = new GiftCardGuardService(
      prisma.raw,
      evidence.raw,
      makeGuardianPause().raw,
      makeTcr().raw,
      makeEnforcement().raw,
      makeRiskEvents().raw,
    );

    await svc.decide(USER, 'warn-1', {
      decision: GiftCardGuardUserDecision.AVOIDED,
      notes: 'I hung up',
    });

    expect(prisma.updates[0].data).toMatchObject({
      decision: 'AVOIDED',
      decisionNotes: 'I hung up',
    });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'GIFTCARD_WARNING_AVOIDED',
    });
  });

  it('on ESCALATED_TO_TRUSTED_CONTACT, logs the 9H TODO', async () => {
    const prisma = makePrisma({
      existing: { id: 'warn-1', decision: 'PENDING' },
    });
    const svc = new GiftCardGuardService(
      prisma.raw,
      makeEvidence().raw,
      makeGuardianPause().raw,
      makeTcr().raw,
      makeEnforcement().raw,
      makeRiskEvents().raw,
    );
    await svc.decide(USER, 'warn-1', {
      decision: GiftCardGuardUserDecision.ESCALATED_TO_TRUSTED_CONTACT,
    });
    expect(prisma.updates[0].data.decision).toBe('ESCALATED_TO_TRUSTED_CONTACT');
  });
});
