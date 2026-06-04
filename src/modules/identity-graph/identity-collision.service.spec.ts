import { IdentityCollisionService } from './identity-collision.service';

/**
 * Prisma double for the consumer collision service. `nodes` seeds the seed-
 * candidate query; `members` seeds the neighbourhood id-IN fetch; `edges`
 * seeds the traversal.
 */
function makePrisma(opts: {
  nodes?: Array<Record<string, unknown>>;
  members?: Array<Record<string, unknown>>;
  edges?: Array<Record<string, unknown>>;
}) {
  const members = opts.members ?? [];
  return {
    raw: {
      fraudGraphNode: {
        findMany: jest.fn(async (args: { where?: unknown }) => {
          const where = args.where as { id?: { in?: string[] } } | undefined;
          if (where?.id?.in) {
            return members.filter((m) => where.id!.in!.includes(m.id as string));
          }
          return opts.nodes ?? [];
        }),
      },
      fraudGraphEdge: {
        findMany: jest.fn(async () => opts.edges ?? []),
      },
    } as never,
  };
}

function node(over: Record<string, unknown>) {
  return {
    id: 'n',
    nodeType: 'INDICATOR',
    indicatorType: 'EMAIL',
    normalizedIndicator: null,
    displayMask: null,
    label: 'label',
    category: null,
    signalCount: 0,
    riskScore: 0,
    firstSeen: new Date('2025-01-01'),
    lastSeen: new Date('2025-06-01'),
    ...over,
  };
}

describe('IdentityCollisionService.search', () => {
  it('returns a clean found:false envelope when nothing matches', async () => {
    const svc = new IdentityCollisionService(makePrisma({ nodes: [] }).raw);

    const out = await svc.search({ query: 'nobody', searchType: 'name' });

    expect(out).toMatchObject({
      found: false,
      matchCount: 0,
      clusterName: null,
      nodes: [],
      linkedClusters: [],
      victimReports: 0,
      riskScore: 0,
    });
  });

  it('builds a masked cluster around the seed and never leaks raw PII / ids', async () => {
    const seed = node({
      id: 'seed',
      nodeType: 'INDICATOR',
      indicatorType: 'EMAIL',
      normalizedIndicator: 'victim@example.com',
      label: 'victim@example.com',
      riskScore: 85,
      signalCount: 4,
    });
    const phone = node({
      id: 'phone',
      nodeType: 'INDICATOR',
      indicatorType: 'PHONE',
      normalizedIndicator: '+6588880123',
      label: '+6588880123',
      riskScore: 70,
      signalCount: 3,
    });
    const campaign = node({
      id: 'camp',
      nodeType: 'CAMPAIGN',
      indicatorType: null,
      normalizedIndicator: null,
      label: 'Romance Crypto Grooming Cluster',
      riskScore: 90,
      signalCount: 12,
    });

    const svc = new IdentityCollisionService(
      makePrisma({
        nodes: [seed],
        members: [phone, campaign],
        edges: [
          { sourceNodeId: 'seed', targetNodeId: 'phone' },
          { sourceNodeId: 'seed', targetNodeId: 'camp' },
        ],
      }).raw,
    );

    const out = await svc.search({ query: 'victim@example.com', searchType: 'email' });

    expect(out.found).toBe(true);
    expect(out.queryType).toBe('Email Address');
    // Cluster comes from the CAMPAIGN node, not the indicators.
    expect(out.clusterName).toBe('Romance Crypto Grooming Cluster');
    expect(out.linkedClusters).toEqual(['Romance Crypto Grooming Cluster']);
    // Risk is the strongest signal (the campaign at 90).
    expect(out.riskScore).toBe(90);
    // Aggregate of seed + linked indicator signal counts (campaign excluded).
    expect(out.victimReports).toBe(7);

    // Seed first, role overridden; campaign is NOT rendered as a node.
    expect(out.nodes[0]).toMatchObject({ type: 'email', role: 'Primary identifier', risk: 'critical' });
    expect(out.matchCount).toBe(2);
    const phoneNode = out.nodes.find((n) => n.type === 'phone');
    expect(phoneNode).toMatchObject({ role: 'Contact number', risk: 'high' });

    // PII guardrail: the linked-node payload carries masked values only and no
    // internal fields. (`query` at the top level is the searcher's OWN typed
    // input echoed back for the page's central node — not a graph leak.)
    const nodesJson = JSON.stringify(out.nodes);
    expect(nodesJson).not.toContain('victim@example.com');
    expect(nodesJson).not.toContain('6588880123'); // full raw phone
    expect(nodesJson).not.toContain('seed'); // no node ids
    expect(out.nodes[0]).not.toHaveProperty('id');
    expect(out.nodes[0]).not.toHaveProperty('signalCount');
    expect(out.nodes[0].value).toBe('v*****@example.com');
  });
});
