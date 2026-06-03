import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WalletGuardUserDecision } from './dto/decide-wallet.dto';
import { WalletGuardService } from './walletguard.service';

function makePrisma(opts: {
  priorContinueCount?: number;
  existing?: Record<string, unknown> | null;
}) {
  const created: Array<Record<string, unknown>> = [];
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  let nextId = 1;
  return {
    raw: {
      walletCheck: {
        count: jest.fn(async () => opts.priorContinueCount ?? 0),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const row = { id: `check-${nextId++}`, decision: 'PENDING', ...data };
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

function makeGraph() {
  return { raw: { recordNode: jest.fn(async () => ({ id: 'node-1' })) } as never };
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

const GOOD_ETH = '0x71C7656EC7ab88b098defB751B7401B5f6d8976F';

describe('WalletGuardService.check', () => {
  it('a clean ETH address with no signals is LOW, no Guardian Pause', async () => {
    const prisma = makePrisma({});
    const gp = makeGuardianPause();
    const svc = new WalletGuardService(prisma.raw, makeEvidence().raw, gp.raw, makeTcr().raw, makeEnforcement().raw, makeRiskEvents().raw, makeGraph().raw);

    await svc.check(USER, { network: 'ETH', address: GOOD_ETH });

    expect(prisma.created[0]).toMatchObject({
      addressValid: true,
      riskLevel: 'LOW',
    });
    expect(gp.started).toHaveLength(0);
  });

  it('a malformed address goes straight to CRITICAL and pulls Guardian Pause', async () => {
    const prisma = makePrisma({});
    const gp = makeGuardianPause();
    const svc = new WalletGuardService(prisma.raw, makeEvidence().raw, gp.raw, makeTcr().raw, makeEnforcement().raw, makeRiskEvents().raw, makeGraph().raw);

    await svc.check(USER, { network: 'ETH', address: '0xdeadbeef' });

    expect(prisma.created[0]).toMatchObject({
      addressValid: false,
      riskScore: 100,
      riskLevel: 'CRITICAL',
    });
    expect(gp.started).toHaveLength(1);
    expect(gp.started[0]).toMatchObject({
      triggerType: 'CRYPTO_TRANSFER_RISK',
      riskLevel: 'CRITICAL',
    });
  });

  it('clipboard swap on a valid address tips toward HIGH and triggers a WALLET_SWITCH pause', async () => {
    const prisma = makePrisma({});
    const gp = makeGuardianPause();
    const svc = new WalletGuardService(prisma.raw, makeEvidence().raw, gp.raw, makeTcr().raw, makeEnforcement().raw, makeRiskEvents().raw, makeGraph().raw);

    await svc.check(USER, {
      network: 'ETH',
      address: GOOD_ETH,
      clipboardSwapDetected: true,
      walletSwitched: true,
      urgencyDetected: true,
    });

    // 0 (UNKNOWN) + 30 (clipboard) + 20 (switch) + 15 (urgency) = 65 → HIGH
    expect(prisma.created[0]).toMatchObject({ riskLevel: 'HIGH' });
    expect(gp.started[0]).toMatchObject({ triggerType: 'WALLET_SWITCH' });
  });

  it('CONFIRMED_SCAM reputation alone pulls a HIGH pause', async () => {
    const prisma = makePrisma({});
    const gp = makeGuardianPause();
    const svc = new WalletGuardService(prisma.raw, makeEvidence().raw, gp.raw, makeTcr().raw, makeEnforcement().raw, makeRiskEvents().raw, makeGraph().raw);

    await svc.check(USER, {
      network: 'ETH',
      address: GOOD_ETH,
      reputation: 'CONFIRMED_SCAM',
    });

    expect(prisma.created[0]).toMatchObject({ riskLevel: 'HIGH' });
    expect(gp.started).toHaveLength(1);
  });

  it('trims surrounding whitespace before persisting', async () => {
    const prisma = makePrisma({});
    const svc = new WalletGuardService(
      prisma.raw,
      makeEvidence().raw,
      makeGuardianPause().raw,
      makeTcr().raw,
      makeEnforcement().raw,
      makeRiskEvents().raw,
      makeGraph().raw,
    );
    await svc.check(USER, { network: 'ETH', address: '  ' + GOOD_ETH + '  ' });
    expect(prisma.created[0].address).toBe(GOOD_ETH);
  });
});

describe('WalletGuardService.decide', () => {
  it('throws NotFound when the row does not exist or belongs to another user', async () => {
    const svc = new WalletGuardService(
      makePrisma({ existing: null }).raw,
      makeEvidence().raw,
      makeGuardianPause().raw,
      makeTcr().raw,
      makeEnforcement().raw,
      makeRiskEvents().raw,
      makeGraph().raw,
    );
    await expect(
      svc.decide(USER, 'nope', { decision: WalletGuardUserDecision.VALIDATED }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequest when the row is already decided', async () => {
    const svc = new WalletGuardService(
      makePrisma({ existing: { id: 'check-1', decision: 'BLOCKED' } }).raw,
      makeEvidence().raw,
      makeGuardianPause().raw,
      makeTcr().raw,
      makeEnforcement().raw,
      makeRiskEvents().raw,
      makeGraph().raw,
    );
    await expect(
      svc.decide(USER, 'check-1', { decision: WalletGuardUserDecision.VALIDATED }),
    ).rejects.toThrow(BadRequestException);
  });

  it('on BLOCKED, records decision + WALLET_CHECK_BLOCKED evidence', async () => {
    const prisma = makePrisma({
      existing: { id: 'check-1', decision: 'PENDING' },
    });
    const evidence = makeEvidence();
    const svc = new WalletGuardService(
      prisma.raw,
      evidence.raw,
      makeGuardianPause().raw,
      makeTcr().raw,
      makeEnforcement().raw,
      makeRiskEvents().raw,
      makeGraph().raw,
    );

    await svc.decide(USER, 'check-1', {
      decision: WalletGuardUserDecision.BLOCKED,
      notes: 'address mismatch with intended recipient',
    });

    expect(prisma.updates[0].data).toMatchObject({
      decision: 'BLOCKED',
      decisionNotes: 'address mismatch with intended recipient',
    });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'WALLET_CHECK_BLOCKED',
    });
  });
});
