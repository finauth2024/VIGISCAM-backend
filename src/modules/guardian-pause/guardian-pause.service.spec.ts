import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GuardianPauseService } from './guardian-pause.service';
import { PauseResolution } from './dto/complete-pause.dto';

/**
 * Permissive-by-default ProtectionEnforcementService mock. CP-2 policy is
 * unit-tested in protection-policy.service.spec.ts; here it just satisfies the
 * constructor. Pass `{ block: true }` to simulate a policy that refuses
 * CONTINUE_ANYWAY (Elder Mode strict lock / trusted-contact required).
 */
function makeEnforcement(opts: { block?: boolean } = {}) {
  const decision = {
    continueAnywayAllowed: !opts.block,
    trustedContactReviewRequired: !!opts.block,
    guardianPauseDurationSeconds: 30,
    reasons: opts.block ? ['ELDER_MODE_STRICT_LOCK'] : [],
  };
  return {
    raw: {
      evaluate: jest.fn(async () => decision),
      enforceDecision: jest.fn(async () => {
        if (opts.block) {
          throw new ForbiddenException({ message: 'blocked', reasons: decision.reasons });
        }
        return decision;
      }),
    } as never,
  };
}

/** Minimal fake Prisma for the service's read/write surface. */
function makePrisma(seed: {
  priorContinueAnyway?: number;
  existing?: Record<string, unknown> | null;
}) {
  const created: Array<Record<string, unknown>> = [];
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  let nextId = 1;
  return {
    raw: {
      pauseEvent: {
        count: jest.fn(async () => seed.priorContinueAnyway ?? 0),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = {
            id: `pause-${nextId++}`,
            status: 'ACTIVE',
            continueAnywayCount: data.continueAnywayCount ?? 0,
            ...data,
          };
          created.push(row);
          return row;
        }),
        findFirst: jest.fn(async () => seed.existing ?? null),
        update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push(args);
          // Mirror back the merged row so the service's downstream reads are realistic.
          return { id: args.where.id, ...seed.existing, ...args.data };
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
        const ev = { id: `ev-${i++}`, ...input };
        appended.push(ev);
        return ev;
      }),
    } as never,
    appended,
  };
}

function makeEvents() {
  const emits: Array<{ userId: string; payload: Record<string, unknown> }> = [];
  return {
    raw: {
      emitGuardianPauseCountdown: jest.fn((userId: string, payload: Record<string, unknown>) => {
        emits.push({ userId, payload });
      }),
    } as never,
    emits,
  };
}

const USER = {
  userId: 'user-1',
  email: 'u@example.com',
  tenantId: 'tenant-A',
  role: 'INDIVIDUAL',
} as never;

describe('GuardianPauseService.start', () => {
  it('creates a pause, appends evidence, links it, emits the countdown', async () => {
    const prisma = makePrisma({});
    const evidence = makeEvidence();
    const events = makeEvents();
    const svc = new GuardianPauseService(prisma.raw, evidence.raw, events.raw, makeEnforcement().raw);

    const row = await svc.start(USER, {
      riskLevel: 'MEDIUM',
      triggerType: 'URGENCY',
      triggerSummary: 'Urgency language detected in chat',
    });

    expect(row.id).toBe('pause-1');
    expect(prisma.created).toHaveLength(1);
    expect(prisma.created[0]).toMatchObject({
      userId: 'user-1',
      tenantId: 'tenant-A',
      riskLevel: 'MEDIUM',
      triggerType: 'URGENCY',
      continueAnywayCount: 0,
    });
    expect(evidence.appended).toHaveLength(1);
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'GUARDIAN_PAUSE_STARTED',
      entityType: 'GUARDIAN_PAUSE',
    });
    expect(prisma.updates[0].data).toEqual({ evidenceEventId: 'ev-1' });
    expect(events.emits).toEqual([
      {
        userId: 'user-1',
        payload: expect.objectContaining({
          status: 'STARTED',
        }),
      },
    ]);
  });

  it('carries the prior CONTINUED_ANYWAY count onto the new pause', async () => {
    const prisma = makePrisma({ priorContinueAnyway: 3 });
    const svc = new GuardianPauseService(
      prisma.raw,
      makeEvidence().raw,
      makeEvents().raw,
      makeEnforcement().raw,
    );

    await svc.start(USER, {
      riskLevel: 'HIGH',
      triggerType: 'CONTINUE_ANYWAY',
      triggerSummary: 'User repeatedly pushed past warnings',
    });

    expect(prisma.created[0]).toMatchObject({ continueAnywayCount: 3 });
  });

  it('honours an explicit durationSeconds override', async () => {
    const prisma = makePrisma({});
    const events = makeEvents();
    const svc = new GuardianPauseService(
      prisma.raw,
      makeEvidence().raw,
      events.raw,
      makeEnforcement().raw,
    );

    await svc.start(USER, {
      riskLevel: 'CRITICAL',
      triggerType: 'CRYPTO_TRANSFER_RISK',
      triggerSummary: 'High-amount crypto transfer to a high-risk wallet',
      durationSeconds: 120,
    });

    expect(events.emits[0].payload.remainingSeconds).toBe(120);
  });
});

describe('GuardianPauseService.complete', () => {
  it('throws NotFound when the pause does not exist or belongs to another user', async () => {
    const svc = new GuardianPauseService(
      makePrisma({ existing: null }).raw,
      makeEvidence().raw,
      makeEvents().raw,
      makeEnforcement().raw,
    );
    await expect(
      svc.complete(USER, 'nope', { resolution: PauseResolution.RESOLVED }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequest when the pause is already terminal', async () => {
    const svc = new GuardianPauseService(
      makePrisma({
        existing: { id: 'pause-1', status: 'RESOLVED', continueAnywayCount: 0 },
      }).raw,
      makeEvidence().raw,
      makeEvents().raw,
      makeEnforcement().raw,
    );
    await expect(
      svc.complete(USER, 'pause-1', { resolution: PauseResolution.RESOLVED }),
    ).rejects.toThrow(BadRequestException);
  });

  it('on RESOLVED, updates status, writes evidence, emits RESOLVED', async () => {
    const prisma = makePrisma({
      existing: { id: 'pause-1', status: 'ACTIVE', continueAnywayCount: 0 },
    });
    const evidence = makeEvidence();
    const events = makeEvents();
    const svc = new GuardianPauseService(prisma.raw, evidence.raw, events.raw, makeEnforcement().raw);
    await svc.complete(USER, 'pause-1', {
      resolution: PauseResolution.RESOLVED,
      notes: 'I called my bank',
    });

    expect(prisma.updates[0].data).toMatchObject({
      status: 'RESOLVED',
      resolutionNotes: 'I called my bank',
      continueAnywayCount: 0,
    });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'GUARDIAN_PAUSE_RESOLVED',
    });
    expect(events.emits[0].payload.status).toBe('RESOLVED');
  });

  it('on CONTINUED_ANYWAY, increments continueAnywayCount on the row', async () => {
    const prisma = makePrisma({
      existing: { id: 'pause-1', status: 'ACTIVE', continueAnywayCount: 2 },
    });
    const evidence = makeEvidence();
    const svc = new GuardianPauseService(
      prisma.raw,
      evidence.raw,
      makeEvents().raw,
      makeEnforcement().raw,
    );
    await svc.complete(USER, 'pause-1', {
      resolution: PauseResolution.CONTINUED_ANYWAY,
    });

    expect(prisma.updates[0].data.continueAnywayCount).toBe(3);
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'GUARDIAN_PAUSE_CONTINUED_ANYWAY',
    });
  });

  it('CP-2: refuses CONTINUED_ANYWAY when protection policy blocks it (Elder Mode)', async () => {
    const prisma = makePrisma({
      existing: { id: 'pause-1', status: 'ACTIVE', riskLevel: 'CRITICAL', continueAnywayCount: 0 },
    });
    const svc = new GuardianPauseService(
      prisma.raw,
      makeEvidence().raw,
      makeEvents().raw,
      makeEnforcement({ block: true }).raw,
    );
    await expect(
      svc.complete(USER, 'pause-1', { resolution: PauseResolution.CONTINUED_ANYWAY }),
    ).rejects.toThrow(ForbiddenException);
    // The block happens BEFORE the status transition — no terminal write.
    expect(prisma.updates).toHaveLength(0);
  });

  it('on EXPIRED, emits status: EXPIRED', async () => {
    const events = makeEvents();
    const svc = new GuardianPauseService(
      makePrisma({
        existing: { id: 'pause-1', status: 'ACTIVE', continueAnywayCount: 0 },
      }).raw,
      makeEvidence().raw,
      events.raw,
      makeEnforcement().raw,
    );
    await svc.complete(USER, 'pause-1', {
      resolution: PauseResolution.EXPIRED,
    });
    expect(events.emits[0].payload.status).toBe('EXPIRED');
  });
});
