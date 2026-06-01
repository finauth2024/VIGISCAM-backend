import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BankPortalService } from './bank-portal.service';
import { BankCaseReviewDecision } from './dto/review-case.dto';
import { BankQueueRiskFilter } from './dto/queue-query.dto';

function makePrisma(
  opts: {
    scamHolds?: Array<Record<string, unknown>>;
    walletChecks?: Array<Record<string, unknown>>;
    scamHoldRow?: Record<string, unknown> | null;
    existingReview?: Record<string, unknown> | null;
  } = {},
) {
  const createdTeller: Array<Record<string, unknown>> = [];
  const createdReview: Array<Record<string, unknown>> = [];
  const updatedTeller: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  const updatedReview: Array<{ where: unknown; data: Record<string, unknown> }> = [];
  let lastTellerRow: Record<string, unknown> | null = null;
  let lastReviewRow: Record<string, unknown> | null = null;
  return {
    raw: {
      scamHoldEvent: {
        findMany: jest.fn(async () => opts.scamHolds ?? []),
        findUnique: jest.fn(async () => opts.scamHoldRow ?? null),
      },
      walletCheck: {
        findMany: jest.fn(async () => opts.walletChecks ?? []),
      },
      tellerAssistScore: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          lastTellerRow = { id: 'teller-1', ...data };
          createdTeller.push(lastTellerRow);
          return lastTellerRow;
        }),
        update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updatedTeller.push(args);
          lastTellerRow = { ...(lastTellerRow ?? {}), ...args.data };
          return lastTellerRow;
        }),
      },
      bankCaseReview: {
        findUnique: jest.fn(async () => opts.existingReview ?? null),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          lastReviewRow = { id: 'review-1', ...data };
          createdReview.push(lastReviewRow);
          return lastReviewRow;
        }),
        update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updatedReview.push(args);
          lastReviewRow = { ...(lastReviewRow ?? {}), ...args.data };
          return lastReviewRow;
        }),
      },
    } as never,
    createdTeller,
    createdReview,
    updatedTeller,
    updatedReview,
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

const TELLER = {
  userId: 'user-1',
  email: 't@bank.example',
  tenantId: 'bank-tenant-A',
  role: 'BANK_ANALYST',
} as never;

describe('BankPortalService.getQueue', () => {
  it('filters by minRiskLevel and returns tenant-scoped events', async () => {
    const prisma = makePrisma({
      scamHolds: [
        {
          id: 's-1',
          userId: 'u-1',
          transactionType: 'WIRE_TRANSFER',
          amountMinor: BigInt(1_000_00),
          currency: 'USD',
          recipient: 'r',
          riskScore: 70,
          riskLevel: 'HIGH',
          status: 'PENDING',
          createdAt: new Date('2026-01-01'),
        },
      ],
      walletChecks: [
        {
          id: 'w-1',
          userId: 'u-1',
          network: 'ETH',
          address: '0xabc',
          riskScore: 60,
          riskLevel: 'HIGH',
          decision: 'PENDING',
          createdAt: new Date('2026-01-02'),
        },
      ],
    });
    const svc = new BankPortalService(prisma.raw, makeEvidence().raw);
    const out = await svc.getQueue(TELLER, { minRiskLevel: BankQueueRiskFilter.HIGH });
    expect(out.scamHoldEvents).toHaveLength(1);
    expect(out.scamHoldEvents[0]).toMatchObject({
      id: 's-1',
      amountMinor: '100000', // BigInt serialized as string
    });
    expect(out.walletChecks).toHaveLength(1);
    // Verify the WHERE filter on the riskLevel list
    const callArgs = (prisma.raw as never as { scamHoldEvent: { findMany: jest.Mock } })
      .scamHoldEvent.findMany.mock.calls[0][0];
    expect(callArgs.where.tenantId).toBe('bank-tenant-A');
    expect(callArgs.where.riskLevel.in).toEqual(['HIGH', 'CRITICAL']);
  });

  it('defaults to MEDIUM+ when no filter is given', async () => {
    const prisma = makePrisma();
    const svc = new BankPortalService(prisma.raw, makeEvidence().raw);
    await svc.getQueue(TELLER, {});
    const callArgs = (prisma.raw as never as { scamHoldEvent: { findMany: jest.Mock } })
      .scamHoldEvent.findMany.mock.calls[0][0];
    expect(callArgs.where.riskLevel.in).toEqual(['MEDIUM', 'HIGH', 'CRITICAL']);
  });
});

describe('BankPortalService.tellerAssist', () => {
  it('scores, persists, links evidence, returns scoring breakdown', async () => {
    const prisma = makePrisma();
    const evidence = makeEvidence();
    const svc = new BankPortalService(prisma.raw, evidence.raw);

    const out = await svc.tellerAssist(TELLER, {
      transactionChannel: 'WIRE_INTERNATIONAL',
      amountMinor: 12_000_00,
      recipientType: 'FOREIGN_PAYEE',
      customerStatedReason: 'INVESTMENT_OPPORTUNITY',
    } as never);

    expect(prisma.createdTeller).toHaveLength(1);
    expect(prisma.createdTeller[0]).toMatchObject({
      tenantId: 'bank-tenant-A',
      tellerUserId: 'user-1',
      riskLevel: 'CRITICAL',
      recommendedAction: 'REFUSE_AND_ESCALATE_TO_FRAUD',
    });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'BANK_PORTAL_TELLER_SCORED',
      tenantId: 'bank-tenant-A',
    });
    expect(prisma.updatedTeller[0].data.evidenceEventId).toBe('ev-1');
    expect(out.scoring.breakdown.length).toBeGreaterThan(0);
  });

  it('a routine ACH lands LOW + PROCEED', async () => {
    const prisma = makePrisma();
    const svc = new BankPortalService(prisma.raw, makeEvidence().raw);
    const out = await svc.tellerAssist(TELLER, {
      transactionChannel: 'ACH',
      amountMinor: 50_00,
      recipientType: 'EXISTING_PAYEE',
    } as never);
    expect(out.scoring.recommendedAction).toBe('PROCEED');
    expect(out.scoring.riskLevel).toBe('LOW');
  });
});

describe('BankPortalService.reviewCase', () => {
  it('throws NotFound when the case does not exist', async () => {
    const svc = new BankPortalService(makePrisma({ scamHoldRow: null }).raw, makeEvidence().raw);
    await expect(
      svc.reviewCase(TELLER, 'no-such', { decision: BankCaseReviewDecision.BLOCK }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFound when the case is owned by another tenant', async () => {
    const svc = new BankPortalService(
      makePrisma({
        scamHoldRow: {
          id: 's-1',
          tenantId: 'bank-tenant-B',
          userId: 'u-1',
          riskLevel: 'HIGH',
          status: 'PENDING',
        },
      }).raw,
      makeEvidence().raw,
    );
    await expect(
      svc.reviewCase(TELLER, 's-1', { decision: BankCaseReviewDecision.BLOCK }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequest when the bank has already reviewed this case', async () => {
    const svc = new BankPortalService(
      makePrisma({
        scamHoldRow: {
          id: 's-1',
          tenantId: 'bank-tenant-A',
          userId: 'u-1',
          riskLevel: 'HIGH',
          status: 'PENDING',
        },
        existingReview: { id: 'review-old' },
      }).raw,
      makeEvidence().raw,
    );
    await expect(
      svc.reviewCase(TELLER, 's-1', { decision: BankCaseReviewDecision.BLOCK }),
    ).rejects.toThrow(BadRequestException);
  });

  it('persists a fresh review and writes a BANK_PORTAL_CASE_<decision> event', async () => {
    const prisma = makePrisma({
      scamHoldRow: {
        id: 's-1',
        tenantId: 'bank-tenant-A',
        userId: 'u-1',
        riskLevel: 'HIGH',
        status: 'PENDING',
      },
    });
    const evidence = makeEvidence();
    const svc = new BankPortalService(prisma.raw, evidence.raw);
    await svc.reviewCase(TELLER, 's-1', {
      decision: BankCaseReviewDecision.NEED_MORE_INFO,
      notes: 'awaiting customer callback',
    });
    expect(prisma.createdReview[0]).toMatchObject({
      tenantId: 'bank-tenant-A',
      scamHoldEventId: 's-1',
      decision: 'NEED_MORE_INFO',
      notes: 'awaiting customer callback',
    });
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'BANK_PORTAL_CASE_NEED_MORE_INFO',
    });
    expect(prisma.updatedReview[0].data.evidenceEventId).toBe('ev-1');
  });
});
