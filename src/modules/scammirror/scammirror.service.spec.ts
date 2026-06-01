import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TurnRole } from './dto/record-input.dto';
import { ScamMirrorService } from './scammirror.service';

function makePrisma(opts: { existing?: Record<string, unknown> | null }) {
  const created: Array<Record<string, unknown>> = [];
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  let row: Record<string, unknown> | null = opts.existing
    ? {
        turns: [],
        tacticsObserved: [],
        ...opts.existing,
      }
    : null;
  return {
    raw: {
      scamMirrorSession: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          const r = {
            id: 'sess-1',
            status: 'ACTIVE',
            turns: [],
            tacticsObserved: [],
            ...data,
          };
          created.push(r);
          row = r;
          return r;
        }),
        findFirst: jest.fn(async () => row),
        update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push(args);
          row = { ...(row ?? {}), ...args.data };
          return row;
        }),
      },
    } as never,
    created,
    updates,
    get row(): Record<string, unknown> | null {
      return row;
    },
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

const USER = {
  userId: 'user-1',
  email: 'u@example.com',
  tenantId: 'tenant-A',
  role: 'INDIVIDUAL',
} as never;

describe('ScamMirrorService.start', () => {
  it('opens an ACTIVE session with the persona + scenario', async () => {
    const prisma = makePrisma({});
    const svc = new ScamMirrorService(prisma.raw, makeEvidence().raw, makeGuardianPause().raw);

    const row = await svc.start(USER, {
      persona: 'TECH_SUPPORT',
      scenario: 'Caller claims my computer has a virus',
    });

    expect(row).toMatchObject({
      id: 'sess-1',
      status: 'ACTIVE',
      persona: 'TECH_SUPPORT',
    });
  });
});

describe('ScamMirrorService.recordInput', () => {
  it('records a turn, accumulates detected tactics', async () => {
    const prisma = makePrisma({
      existing: { id: 'sess-1', status: 'ACTIVE', persona: 'TECH_SUPPORT' },
    });
    const svc = new ScamMirrorService(prisma.raw, makeEvidence().raw, makeGuardianPause().raw);

    await svc.recordInput(USER, 'sess-1', {
      role: TurnRole.SCAMMER,
      text: 'You need to act fast right now or face arrest',
    });

    const last = prisma.updates[0].data as { turns: unknown[]; tacticsObserved: string[] };
    expect(last.turns).toHaveLength(1);
    expect(last.tacticsObserved).toEqual(expect.arrayContaining(['URGENCY', 'THREAT']));
  });

  it('dedupes tactics across turns', async () => {
    const prisma = makePrisma({
      existing: {
        id: 'sess-1',
        status: 'ACTIVE',
        persona: 'TECH_SUPPORT',
        turns: [
          { turn: 1, role: 'SCAMMER', text: 'Act fast', tacticsDetected: ['URGENCY'], at: '' },
        ],
        tacticsObserved: ['URGENCY'],
      },
    });
    const svc = new ScamMirrorService(prisma.raw, makeEvidence().raw, makeGuardianPause().raw);

    await svc.recordInput(USER, 'sess-1', {
      role: TurnRole.SCAMMER,
      text: 'Hurry, do it right now',
    });

    const updated = prisma.updates[0].data as { tacticsObserved: string[] };
    expect(updated.tacticsObserved).toEqual(['URGENCY']);
  });

  it('aborts the session + pulls Guardian Pause when sanitizer detects a real credential', async () => {
    const prisma = makePrisma({
      existing: { id: 'sess-1', status: 'ACTIVE', persona: 'BANK_IMPERSONATION' },
    });
    const evidence = makeEvidence();
    const gp = makeGuardianPause();
    const svc = new ScamMirrorService(prisma.raw, evidence.raw, gp.raw);

    await svc.recordInput(USER, 'sess-1', {
      role: TurnRole.USER,
      // Luhn-valid Visa test card
      text: 'my card is 4242 4242 4242 4242',
    });

    // First update aborts the row...
    expect(prisma.updates[0].data).toMatchObject({
      status: 'ABORTED_REAL_CREDS',
      endReason: expect.stringContaining('CREDIT_CARD'),
    });
    // Evidence event recorded WITHOUT the offending text.
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'SCAMMIRROR_ABORTED_REAL_CREDS',
      metadata: { reason: 'CREDIT_CARD', persona: 'BANK_IMPERSONATION' },
    });
    // Guardian Pause pulled.
    expect(gp.started).toHaveLength(1);
    expect(gp.started[0]).toMatchObject({
      triggerType: 'SECRECY',
      riskLevel: 'HIGH',
    });
  });

  it('throws NotFound for a session that does not belong to the user', async () => {
    const prisma = makePrisma({ existing: null });
    const svc = new ScamMirrorService(prisma.raw, makeEvidence().raw, makeGuardianPause().raw);

    await expect(
      svc.recordInput(USER, 'nope', { role: TurnRole.USER, text: 'hi' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequest when the session is already ended', async () => {
    const prisma = makePrisma({
      existing: { id: 'sess-1', status: 'ENDED_LEARNED' },
    });
    const svc = new ScamMirrorService(prisma.raw, makeEvidence().raw, makeGuardianPause().raw);

    await expect(
      svc.recordInput(USER, 'sess-1', { role: TurnRole.USER, text: 'hi' }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('ScamMirrorService.end', () => {
  it('on learned=true, marks ENDED_LEARNED + writes evidence', async () => {
    const prisma = makePrisma({
      existing: { id: 'sess-1', status: 'ACTIVE', persona: 'ROMANCE' },
    });
    const evidence = makeEvidence();
    const svc = new ScamMirrorService(prisma.raw, evidence.raw, makeGuardianPause().raw);

    await svc.end(USER, 'sess-1', true);

    expect(prisma.updates[0].data).toMatchObject({
      status: 'ENDED_LEARNED',
      endedAt: expect.any(Date),
    });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'SCAMMIRROR_ENDED_LEARNED',
    });
  });

  it('on learned=false, marks ENDED_ABANDONED', async () => {
    const prisma = makePrisma({
      existing: { id: 'sess-1', status: 'ACTIVE', persona: 'ROMANCE' },
    });
    const evidence = makeEvidence();
    const svc = new ScamMirrorService(prisma.raw, evidence.raw, makeGuardianPause().raw);

    await svc.end(USER, 'sess-1', false);

    expect(prisma.updates[0].data).toMatchObject({ status: 'ENDED_ABANDONED' });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'SCAMMIRROR_ENDED_ABANDONED',
    });
  });
});
