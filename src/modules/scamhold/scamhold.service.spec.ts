import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ScamHoldDecision } from './dto/decide-scamhold.dto';
import { ScamHoldService } from './scamhold.service';

function makePrisma(opts: {
  priorContinueCount?: number;
  existing?: Record<string, unknown> | null;
}) {
  const created: Array<Record<string, unknown>> = [];
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  let nextId = 1;
  return {
    raw: {
      scamHoldEvent: {
        count: jest.fn(async () => opts.priorContinueCount ?? 0),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `hold-${nextId++}`, status: 'PENDING', ...data };
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
      start: jest.fn(async (_user: unknown, dto: Record<string, unknown>) => {
        started.push(dto);
        return { id: `pause-${started.length}` };
      }),
    } as never,
    started,
  };
}

function makeTcr() {
  // No test in this file exercises the SEND_TO_TRUSTED_CONTACT path,
  // so the mock just exists to satisfy the constructor signature.
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

const USER = {
  userId: 'user-1',
  email: 'u@example.com',
  tenantId: 'tenant-A',
  role: 'INDIVIDUAL',
} as never;

describe('ScamHoldService.check', () => {
  it('opens a PENDING row, scores it, writes Evidence Vault, links it back', async () => {
    const prisma = makePrisma({});
    const evidence = makeEvidence();
    const gp = makeGuardianPause();
    const svc = new ScamHoldService(prisma.raw, evidence.raw, gp.raw, makeTcr().raw);

    const row = await svc.check(USER, {
      transactionType: 'BANK_TRANSFER',
      amountMinor: 100_000, // $1,000
      currency: 'USD',
      recipient: 'acct-12345',
    });

    expect(row.id).toBe('hold-1');
    expect(prisma.created[0]).toMatchObject({
      userId: 'user-1',
      transactionType: 'BANK_TRANSFER',
      riskLevel: 'LOW', // 10 (BANK) + 5 ($1k) + 5 (UNKNOWN) = 20 → LOW
    });
    expect(evidence.appended).toHaveLength(1);
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'SCAMHOLD_OPENED',
      entityType: 'SCAMHOLD',
    });
    expect(prisma.updates[0].data).toEqual({
      evidenceEventId: 'ev-1',
      guardianPauseEventId: null,
    });
    expect(gp.started).toHaveLength(0);
  });

  it('on CRITICAL risk, pulls Guardian Pause and stores its id on the row', async () => {
    const prisma = makePrisma({});
    const gp = makeGuardianPause();
    const svc = new ScamHoldService(prisma.raw, makeEvidence().raw, gp.raw, makeTcr().raw);

    await svc.check(USER, {
      transactionType: 'CRYPTO',
      amountMinor: 100_000, // $1,000
      currency: 'USD',
      recipient: '0xdead',
      recipientRisk: 'SUSPICIOUS_WALLET',
      urgencyDetected: true,
      secrecyDetected: true,
      activeCommunication: true,
    });

    // Score caps at 100 → CRITICAL → pull Guardian Pause.
    expect(gp.started).toHaveLength(1);
    expect(gp.started[0]).toMatchObject({
      triggerType: 'SCAMHOLD_ACTIVE',
      riskLevel: 'CRITICAL',
      durationSeconds: 120,
    });
    expect(prisma.updates[0].data).toEqual({
      evidenceEventId: 'ev-1',
      guardianPauseEventId: 'pause-1',
    });
  });

  it('feeds prior CONTINUE_ANYWAY count into the scorer', async () => {
    const prisma = makePrisma({ priorContinueCount: 4 });
    const svc = new ScamHoldService(
      prisma.raw,
      makeEvidence().raw,
      makeGuardianPause().raw,
      makeTcr().raw,
    );

    await svc.check(USER, {
      transactionType: 'ONLINE_PAYMENT',
      amountMinor: 5_000,
      currency: 'USD',
      recipient: 'merchant',
    });

    expect(prisma.created[0]).toMatchObject({
      priorWarningsCount: 4,
    });
    // 5 (ONLINE) + 0 ($50) + 5 (UNKNOWN) + 20 (4*5 priors, capped 20) = 30 → LOW
    expect((prisma.created[0] as { riskScore: number }).riskScore).toBe(30);
  });
});

describe('ScamHoldService.decide', () => {
  it('throws NotFound when the row does not belong to the user', async () => {
    const svc = new ScamHoldService(
      makePrisma({ existing: null }).raw,
      makeEvidence().raw,
      makeGuardianPause().raw,
      makeTcr().raw,
    );
    await expect(svc.decide(USER, 'nope', { decision: ScamHoldDecision.BLOCK })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws BadRequest when the row is already decided', async () => {
    const svc = new ScamHoldService(
      makePrisma({
        existing: { id: 'hold-1', status: 'BLOCK' },
      }).raw,
      makeEvidence().raw,
      makeGuardianPause().raw,
      makeTcr().raw,
    );
    await expect(svc.decide(USER, 'hold-1', { decision: ScamHoldDecision.BLOCK })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('on BLOCK, updates status + appends evidence', async () => {
    const prisma = makePrisma({
      existing: { id: 'hold-1', status: 'PENDING' },
    });
    const evidence = makeEvidence();
    const svc = new ScamHoldService(
      prisma.raw,
      evidence.raw,
      makeGuardianPause().raw,
      makeTcr().raw,
    );

    await svc.decide(USER, 'hold-1', {
      decision: ScamHoldDecision.BLOCK,
      notes: 'caller refused to verify identity',
    });

    expect(prisma.updates[0].data).toMatchObject({
      status: 'BLOCK',
      decisionNotes: 'caller refused to verify identity',
    });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'SCAMHOLD_BLOCK',
    });
  });

  it('on CONTINUE_ANYWAY, appends a distinct evidence event', async () => {
    const prisma = makePrisma({
      existing: { id: 'hold-1', status: 'PENDING' },
    });
    const evidence = makeEvidence();
    const svc = new ScamHoldService(
      prisma.raw,
      evidence.raw,
      makeGuardianPause().raw,
      makeTcr().raw,
    );
    await svc.decide(USER, 'hold-1', {
      decision: ScamHoldDecision.CONTINUE_ANYWAY,
    });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'SCAMHOLD_CONTINUE_ANYWAY',
    });
  });
});
