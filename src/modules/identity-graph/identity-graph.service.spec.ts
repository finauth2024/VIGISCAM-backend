import { NotFoundException } from '@nestjs/common';
import { IdentityGraphService } from './identity-graph.service';

function makePrisma(opts: {
  nodes?: Array<Record<string, unknown>>;
  campaign?: Record<string, unknown> | null;
  members?: Array<Record<string, unknown>>;
  edges?: Array<Record<string, unknown>>;
}) {
  return {
    raw: {
      fraudGraphNode: {
        findMany: jest.fn(async (args: { where?: unknown }) => {
          // For search(): return seeded `nodes`. For exportCluster(): return
          // seeded `members` when the where clause filters by id IN.
          const where = args.where as { id?: { in?: string[] } } | undefined;
          if (where?.id?.in) {
            return opts.members ?? [];
          }
          return opts.nodes ?? [];
        }),
        findUnique: jest.fn(async () => opts.campaign ?? null),
      },
      fraudGraphEdge: {
        findMany: jest.fn(async () => opts.edges ?? []),
      },
    } as never,
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

const USER = {
  userId: 'user-1',
  email: 'u@example.com',
  tenantId: 'tenant-A',
  role: 'REVIEWER',
} as never;

describe('IdentityGraphService.search', () => {
  it('returns masked display values for INDICATOR rows', async () => {
    const prisma = makePrisma({
      nodes: [
        {
          id: 'n-1',
          nodeType: 'INDICATOR',
          normalizedIndicator: 'titus@example.com',
          displayMask: null,
          label: 'titus@example.com',
          category: 'PHISHING',
          riskScore: 75,
          signalCount: 4,
          firstSeen: new Date('2026-01-01'),
          lastSeen: new Date('2026-06-01'),
        },
      ],
    });
    const svc = new IdentityGraphService(prisma.raw, makeEvidence().raw);

    const out = await svc.search({ q: 'titus' });

    expect(out).toEqual([
      expect.objectContaining({
        id: 'n-1',
        nodeType: 'INDICATOR',
        display: 't****@example.com',
        riskScore: 75,
      }),
    ]);
  });

  it('masks PROFILE nodes (Phase 9G sensitive type)', async () => {
    const prisma = makePrisma({
      nodes: [
        {
          id: 'n-2',
          nodeType: 'PROFILE',
          normalizedIndicator: '@paypalsupport',
          displayMask: null,
          label: '@paypalsupport',
          category: null,
          riskScore: 80,
          signalCount: 3,
          firstSeen: new Date(),
          lastSeen: new Date(),
        },
      ],
    });
    const out = await new IdentityGraphService(prisma.raw, makeEvidence().raw).search({
      q: 'paypal',
    });

    expect(out[0].display).toBe('@p**********rt');
  });
});

describe('IdentityGraphService.exportCluster', () => {
  it('throws NotFound when the node does not exist', async () => {
    const svc = new IdentityGraphService(makePrisma({ campaign: null }).raw, makeEvidence().raw);
    await expect(svc.exportCluster(USER, 'nope', {})).rejects.toThrow(NotFoundException);
  });

  it('throws NotFound when the node is not a CAMPAIGN', async () => {
    const svc = new IdentityGraphService(
      makePrisma({
        campaign: { id: 'n-1', nodeType: 'INDICATOR', label: 'x' },
      }).raw,
      makeEvidence().raw,
    );
    await expect(svc.exportCluster(USER, 'n-1', {})).rejects.toThrow(NotFoundException);
  });

  it('exports a CAMPAIGN cluster, masks members, writes IDENTITY_COLLISION_REPORT', async () => {
    const evidence = makeEvidence();
    const svc = new IdentityGraphService(
      makePrisma({
        campaign: {
          id: 'camp-1',
          nodeType: 'CAMPAIGN',
          normalizedIndicator: null,
          displayMask: null,
          label: 'Bank impersonation cluster',
          category: 'BANK_IMPERSONATION',
          riskScore: 90,
          signalCount: 12,
          firstSeen: new Date(),
          lastSeen: new Date(),
        },
        edges: [
          {
            id: 'e-1',
            sourceNodeId: 'camp-1',
            targetNodeId: 'n-2',
            edgeType: 'CAMPAIGN_MEMBERSHIP',
            weight: 1,
            evidenceCount: 1,
            firstSeen: new Date(),
            lastSeen: new Date(),
          },
        ],
        members: [
          {
            id: 'n-2',
            nodeType: 'INDICATOR',
            normalizedIndicator: 'titus@example.com',
            displayMask: null,
            label: 'titus@example.com',
            category: 'PHISHING',
            riskScore: 75,
            signalCount: 3,
            firstSeen: new Date(),
            lastSeen: new Date(),
          },
        ],
      }).raw,
      evidence.raw,
    );

    const out = await svc.exportCluster(USER, 'camp-1', {
      notes: 'For investigator case INV-2026-001',
    });

    expect(out.cluster.campaign.id).toBe('camp-1');
    expect(out.cluster.members).toHaveLength(1);
    expect(out.cluster.members[0].display).toBe('t****@example.com');
    expect(out.cluster.edges).toHaveLength(1);
    expect(evidence.appended[0]).toMatchObject({
      eventType: 'IDENTITY_COLLISION_REPORT',
      entityType: 'FRAUD_GRAPH_CAMPAIGN',
      metadata: { memberCount: 1, edgeCount: 1 },
    });
    expect(out.evidenceEventId).toBe('ev-1');
  });
});
