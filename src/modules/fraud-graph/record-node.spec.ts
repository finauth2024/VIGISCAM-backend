import { FraudGraphService } from './fraud-graph.service';

describe('FraudGraphService.recordNode (CP-12)', () => {
  it('creates a masked, risk-scored node for a new wallet indicator', async () => {
    const created: Array<Record<string, unknown>> = [];
    const prisma = {
      fraudGraphNode: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async (args: { data: Record<string, unknown> }) => {
          created.push(args.data);
          return { id: 'n1', ...args.data };
        }),
      },
    } as never;
    const node = await new FraudGraphService(prisma).recordNode({
      indicatorType: 'CRYPTO_WALLET',
      indicatorValue: '0xABC123def456',
      category: 'CRYPTO_SCAM',
      riskScore: 84,
      source: 'WALLETGUARD',
    });
    expect(node.id).toBe('n1');
    expect(created[0]).toMatchObject({
      nodeType: 'INDICATOR',
      indicatorType: 'CRYPTO_WALLET',
      riskScore: 84,
      signalCount: 1,
    });
    expect(created[0].displayMask).toBeTruthy();
  });

  it('dedupes an existing node: bumps signalCount + max riskScore', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const prisma = {
      fraudGraphNode: {
        findUnique: jest.fn(async () => ({ id: 'n1', riskScore: 50, category: null, displayMask: 'x' })),
        update: jest.fn(async (args: { data: Record<string, unknown> }) => {
          updates.push(args.data);
          return { id: 'n1', ...args.data };
        }),
      },
    } as never;
    await new FraudGraphService(prisma).recordNode({
      indicatorType: 'PHONE',
      indicatorValue: '+1 (555) 123-4567',
      riskScore: 90,
      source: 'CLAIMVERIFY',
    });
    expect(updates[0]).toMatchObject({ riskScore: 90, signalCount: { increment: 1 } });
  });
});
