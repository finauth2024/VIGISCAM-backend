import { Injectable, Logger } from '@nestjs/common';
import {
  FraudGraphNode,
  FraudGraphNodeType,
  IndicatorType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CollisionSearchDto, CollisionSearchType } from './dto/collision-search.dto';
import { mask } from './masker';

/**
 * Identity Collision Graph™ — **consumer-safe** read surface (CP-13).
 *
 * The internal `IdentityGraphService` returns a flat list of masked nodes to
 * reviewers / compliance / admins. This service serves the consumer dashboard
 * page (`role="individual"`) instead: it runs the same fraud-graph lookup but
 *
 *   1. masks every node value through the shared {@link mask} guardrail,
 *   2. assembles the matched nodes into the *cluster* shape the page renders
 *      (a focal "fraud actor match" + linked identifiers + linked clusters),
 *   3. exposes ONLY presentation fields — no node ids, no raw indicators, no
 *      per-node signal counts, no internal category codes, no edge internals.
 *
 * Anyone authenticated may call it; the output carries no victim PII and no
 * internal-only fields, so it is safe for individuals.
 */
@Injectable()
export class IdentityCollisionService {
  private readonly logger = new Logger(IdentityCollisionService.name);

  /** Hard caps so a consumer query can never fan the graph traversal out. */
  private static readonly SEED_CANDIDATES = 5;
  private static readonly MAX_NODES = 24;

  constructor(private readonly prisma: PrismaService) {}

  async search(dto: CollisionSearchDto): Promise<CollisionResult> {
    const q = dto.query.trim();
    const queryType = HUMAN_LABEL[dto.searchType];

    const where = this.buildWhere(q, dto.searchType);
    const candidates = await this.prisma.fraudGraphNode.findMany({
      where,
      orderBy: [{ riskScore: 'desc' }, { signalCount: 'desc' }],
      take: IdentityCollisionService.SEED_CANDIDATES,
    });

    const seed = candidates[0];
    if (!seed) {
      // Clean "no fraud-graph match" envelope — the page renders an empty
      // state from `found: false` rather than a fabricated match.
      return {
        found: false,
        query: q,
        queryType,
        matchCount: 0,
        clusterName: null,
        riskScore: 0,
        nodes: [],
        victimReports: 0,
        linkedClusters: [],
        firstSeen: null,
        lastActive: null,
      };
    }

    // Two-hop neighbourhood around the seed, bounded by MAX_NODES. Campaigns
    // are often one hop past the indicator a consumer searched, so we walk to
    // depth 2 but only to discover cluster membership.
    const collected = await this.collectNeighbourhood(seed);

    const campaigns = collected.filter((n) => n.nodeType === 'CAMPAIGN');
    const memberNodes = collected.filter((n) => n.nodeType !== 'CAMPAIGN' && n.id !== seed.id);

    // Linked clusters: every campaign label, highest-risk first, deduped.
    const linkedClusters = [
      ...new Set(
        [...campaigns]
          .sort((a, b) => b.riskScore - a.riskScore)
          .map((c) => c.label)
          .filter(Boolean),
      ),
    ];
    const clusterName = linkedClusters[0] ?? null;

    // Nodes the page draws: the searched identifier first, then linked ones.
    const nodes: CollisionNode[] = [
      this.toCollisionNode(seed, 'Primary identifier'),
      ...memberNodes.map((n) => this.toCollisionNode(n)),
    ];

    // Overall risk = the strongest signal in the cluster (seed or any campaign).
    const riskScore = Math.max(seed.riskScore, ...campaigns.map((c) => c.riskScore), 0);

    // "Victim reports" is a presentation aggregate of the signal counts feeding
    // this cluster (seed + linked indicators). We never surface per-node counts.
    const victimReports =
      seed.signalCount + memberNodes.reduce((sum, n) => sum + n.signalCount, 0);

    const allInCluster = [seed, ...memberNodes, ...campaigns];
    const firstSeen = minDate(allInCluster.map((n) => n.firstSeen));
    const lastActive = maxDate(allInCluster.map((n) => n.lastSeen));

    this.logger.log(
      `Identity collision search: type=${dto.searchType} seedRisk=${seed.riskScore} ` +
        `nodes=${nodes.length} clusters=${linkedClusters.length}`,
    );

    return {
      found: true,
      query: q,
      queryType,
      matchCount: nodes.length,
      clusterName,
      riskScore,
      nodes,
      victimReports,
      linkedClusters,
      firstSeen: firstSeen?.toISOString() ?? null,
      lastActive: lastActive?.toISOString() ?? null,
    };
  }

  /**
   * Free-text contains-match over label + normalizedIndicator, narrowed by the
   * frontend search type. The type filter is a hint, not a hard requirement —
   * a `name` search stays broad while `phone`/`wallet`/etc. constrain to the
   * relevant node/indicator types.
   */
  private buildWhere(q: string, searchType: CollisionSearchType): Prisma.FraudGraphNodeWhereInput {
    const text: Prisma.FraudGraphNodeWhereInput = {
      OR: [
        { label: { contains: q, mode: 'insensitive' } },
        { normalizedIndicator: { contains: q, mode: 'insensitive' } },
      ],
    };

    const typeFilter = TYPE_FILTER[searchType];
    if (!typeFilter) return text;

    return { AND: [text, typeFilter] };
  }

  /** Seed → one hop → two hops, deduped, capped at MAX_NODES (incl. seed). */
  private async collectNeighbourhood(seed: FraudGraphNode): Promise<FraudGraphNode[]> {
    const byId = new Map<string, FraudGraphNode>([[seed.id, seed]]);
    let frontier = [seed.id];

    for (let hop = 0; hop < 2 && byId.size < IdentityCollisionService.MAX_NODES; hop++) {
      const edges = await this.prisma.fraudGraphEdge.findMany({
        where: {
          OR: [{ sourceNodeId: { in: frontier } }, { targetNodeId: { in: frontier } }],
        },
      });

      const nextIds = new Set<string>();
      for (const e of edges) {
        if (!byId.has(e.sourceNodeId)) nextIds.add(e.sourceNodeId);
        if (!byId.has(e.targetNodeId)) nextIds.add(e.targetNodeId);
      }
      if (nextIds.size === 0) break;

      const remaining = IdentityCollisionService.MAX_NODES - byId.size;
      const fetchIds = [...nextIds].slice(0, Math.max(remaining, 0));
      if (fetchIds.length === 0) break;

      const fetched = await this.prisma.fraudGraphNode.findMany({
        where: { id: { in: fetchIds } },
      });
      for (const n of fetched) byId.set(n.id, n);
      frontier = fetched.map((n) => n.id);
    }

    return [...byId.values()];
  }

  /**
   * Map a graph node to the consumer node shape. Only presentation fields leave
   * here: the FRONTEND node type, the MASKED value, a human role, and a coarse
   * risk band. No id / raw indicator / signal count / category escapes.
   */
  private toCollisionNode(node: FraudGraphNode, roleOverride?: string): CollisionNode {
    const type = frontendNodeType(node);
    return {
      type,
      value: mask({
        nodeType: node.nodeType,
        normalizedIndicator: node.normalizedIndicator,
        displayMask: node.displayMask,
        label: node.label,
      }),
      role: roleOverride ?? ROLE_BY_TYPE[type],
      risk: riskBand(node.riskScore),
    };
  }
}

// ────────────────────────── response contract ──────────────────────────

/** A single linked identifier as the consumer page renders it. */
export interface CollisionNode {
  /** Frontend taxonomy: handle | phone | wallet | domain | email | image | voice | phrase. */
  type: string;
  /** Masked, public-safe display value. Never the raw indicator. */
  value: string;
  /** Human-readable role of this node within the cluster. */
  role: string;
  /** Coarse risk band the page colours by. */
  risk: RiskBand;
}

export type RiskBand = 'critical' | 'high' | 'medium' | 'low';

/** The collision result shape `app/dashboard/identity-graph` consumes. */
export interface CollisionResult {
  found: boolean;
  query: string;
  queryType: string;
  matchCount: number;
  clusterName: string | null;
  riskScore: number;
  nodes: CollisionNode[];
  victimReports: number;
  linkedClusters: string[];
  firstSeen: string | null;
  lastActive: string | null;
}

// ────────────────────────── mapping tables ──────────────────────────

const HUMAN_LABEL: Record<CollisionSearchType, string> = {
  name: 'Name',
  phone: 'Phone Number',
  email: 'Email Address',
  wallet: 'Crypto Wallet',
  domain: 'Website / Domain',
  handle: 'Social Media Handle',
  image: 'Profile Image',
  voice: 'Voice Sample',
  phrase: 'Script Phrase',
};

const ROLE_BY_TYPE: Record<string, string> = {
  handle: 'Linked identity',
  phone: 'Contact number',
  wallet: 'Payment destination',
  domain: 'Linked domain / site',
  email: 'Email used',
  image: 'Profile photo reuse',
  voice: 'Voice sample match',
  phrase: 'Script phrase match',
};

/** searchType → graph filter. Absent => broad free-text (e.g. `name`). */
const TYPE_FILTER: Record<CollisionSearchType, Prisma.FraudGraphNodeWhereInput | null> = {
  name: null,
  phone: { indicatorType: IndicatorType.PHONE },
  email: { indicatorType: IndicatorType.EMAIL },
  wallet: { indicatorType: IndicatorType.CRYPTO_WALLET },
  domain: { indicatorType: { in: [IndicatorType.DOMAIN, IndicatorType.URL] } },
  handle: {
    OR: [
      { nodeType: FraudGraphNodeType.PROFILE },
      { indicatorType: IndicatorType.SOCIAL_PROFILE },
    ],
  },
  image: { nodeType: FraudGraphNodeType.FACE_SIGNAL },
  voice: { nodeType: FraudGraphNodeType.VOICE_SIGNAL },
  phrase: {
    OR: [
      { nodeType: FraudGraphNodeType.SCRIPT_PATTERN },
      { indicatorType: IndicatorType.SCAM_PHRASE },
    ],
  },
};

/** Map a graph node onto the frontend's node-type taxonomy (drives the icon). */
function frontendNodeType(node: FraudGraphNode): string {
  switch (node.nodeType) {
    case 'PROFILE':
    case 'ACTOR':
      return 'handle';
    case 'FACE_SIGNAL':
      return 'image';
    case 'VOICE_SIGNAL':
      return 'voice';
    case 'SCRIPT_PATTERN':
      return 'phrase';
    case 'PAYMENT_REQUEST':
    case 'GIFT_CARD_REQUEST':
      return 'wallet';
    case 'IP_RANGE':
      return 'domain';
    case 'INDICATOR':
      return indicatorToFrontendType(node.indicatorType);
    default:
      return 'handle';
  }
}

function indicatorToFrontendType(indicatorType: IndicatorType | null): string {
  switch (indicatorType) {
    case 'PHONE':
      return 'phone';
    case 'EMAIL':
      return 'email';
    case 'DOMAIN':
    case 'URL':
      return 'domain';
    case 'CRYPTO_WALLET':
      return 'wallet';
    case 'SCAM_PHRASE':
      return 'phrase';
    case 'SOCIAL_PROFILE':
      return 'handle';
    default:
      return 'handle';
  }
}

function riskBand(riskScore: number): RiskBand {
  if (riskScore >= 80) return 'critical';
  if (riskScore >= 60) return 'high';
  if (riskScore >= 40) return 'medium';
  return 'low';
}

function minDate(dates: Date[]): Date | null {
  if (dates.length === 0) return null;
  return dates.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
}

function maxDate(dates: Date[]): Date | null {
  if (dates.length === 0) return null;
  return dates.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
}
