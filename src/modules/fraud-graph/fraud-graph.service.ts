import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  FraudGraphEdgeType,
  FraudGraphNode,
  FraudGraphNodeType,
  IndicatorType,
  Prisma,
  ScamSignal,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

const CLUSTER_PEER_SCAN_CAP = 200;
const SIMILARITY_PEER_SCAN_CAP = 50;
const NEIGHBOR_DEFAULT_LIMIT = 50;

export interface ProcessSignalResult {
  node: FraudGraphNode;
  clusterEdges: number;
  similarityEdges: number;
}

/**
 * Identity Collision Graph (PDF §32 advanced version, "Identity Collision
 * Graph"). Maintains a node per unique scam indicator and weighted edges
 * between nodes that co-occur in clusters or that have text-similar signals.
 * The graph is queryable intelligence — never a public surface.
 */
@Injectable()
export class FraudGraphService {
  private readonly logger = new Logger(FraudGraphService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Project a signal onto the graph: ensure its indicator node exists,
   * strengthen edges to its cluster peers, strengthen edges to its
   * embedding-similar peers.
   */
  async processSignal(signal: ScamSignal): Promise<ProcessSignalResult> {
    const node = await this.ensureNodeForSignal(signal);
    const clusterEdges = await this.linkClusterPeers(node, signal);
    const similarityEdges = await this.linkSimilarityPeers(node, signal);
    return { node, clusterEdges, similarityEdges };
  }

  /** Find-or-create a node for this signal's indicator + bump aggregates. */
  private async ensureNodeForSignal(signal: ScamSignal): Promise<FraudGraphNode> {
    const where = {
      indicatorType_normalizedIndicator: {
        indicatorType: signal.indicatorType,
        normalizedIndicator: signal.normalizedIndicator,
      },
    };
    const existing = await this.prisma.fraudGraphNode.findUnique({ where });
    if (existing) {
      return this.prisma.fraudGraphNode.update({
        where: { id: existing.id },
        data: {
          signalCount: { increment: 1 },
          riskScore: Math.max(existing.riskScore, signal.confidenceScore),
          // Keep the earliest category we learned, but fill it if previously null.
          category: existing.category ?? signal.category ?? null,
          lastSeen: new Date(),
        },
      });
    }
    return this.prisma.fraudGraphNode.create({
      data: {
        nodeType: FraudGraphNodeType.INDICATOR,
        indicatorType: signal.indicatorType,
        normalizedIndicator: signal.normalizedIndicator,
        label: signal.indicatorValue,
        category: signal.category,
        signalCount: 1,
        riskScore: signal.confidenceScore,
      },
    });
  }

  /** Create / strengthen CO_OCCURRENCE_CLUSTER edges to all cluster siblings. */
  private async linkClusterPeers(node: FraudGraphNode, signal: ScamSignal): Promise<number> {
    if (!signal.clusterId) return 0;
    const siblings = await this.prisma.scamSignal.findMany({
      where: { clusterId: signal.clusterId, id: { not: signal.id } },
      select: { id: true, indicatorType: true, normalizedIndicator: true },
      take: CLUSTER_PEER_SCAN_CAP,
    });
    let written = 0;
    for (const sib of siblings) {
      const sibNode = await this.prisma.fraudGraphNode.findUnique({
        where: {
          indicatorType_normalizedIndicator: {
            indicatorType: sib.indicatorType,
            normalizedIndicator: sib.normalizedIndicator,
          },
        },
      });
      if (!sibNode) continue;
      if (await this.upsertEdge(node.id, sibNode.id, 'CO_OCCURRENCE_CLUSTER', 1)) {
        written++;
      }
    }
    return written;
  }

  /** Create / strengthen SIMILAR_TEXT edges to embedding-similar peers. */
  private async linkSimilarityPeers(node: FraudGraphNode, signal: ScamSignal): Promise<number> {
    const sims = await this.prisma.signalSimilarity.findMany({
      where: { OR: [{ signalAId: signal.id }, { signalBId: signal.id }] },
      orderBy: { score: 'desc' },
      take: SIMILARITY_PEER_SCAN_CAP,
    });
    let written = 0;
    for (const sim of sims) {
      const otherId = sim.signalAId === signal.id ? sim.signalBId : sim.signalAId;
      const other = await this.prisma.scamSignal.findUnique({
        where: { id: otherId },
        select: { indicatorType: true, normalizedIndicator: true },
      });
      if (!other) continue;
      const otherNode = await this.prisma.fraudGraphNode.findUnique({
        where: {
          indicatorType_normalizedIndicator: {
            indicatorType: other.indicatorType,
            normalizedIndicator: other.normalizedIndicator,
          },
        },
      });
      if (!otherNode) continue;
      if (await this.upsertEdge(node.id, otherNode.id, 'SIMILAR_TEXT', sim.score)) {
        written++;
      }
    }
    return written;
  }

  /** Idempotent edge upsert with canonical pair ordering. Returns true on write. */
  private async upsertEdge(
    nodeAId: string,
    nodeBId: string,
    edgeType: FraudGraphEdgeType,
    weight: number,
  ): Promise<boolean> {
    if (nodeAId === nodeBId) return false; // self-loop guard
    const [sourceNodeId, targetNodeId] =
      nodeAId < nodeBId ? [nodeAId, nodeBId] : [nodeBId, nodeAId];
    try {
      await this.prisma.fraudGraphEdge.upsert({
        where: {
          sourceNodeId_targetNodeId_edgeType: { sourceNodeId, targetNodeId, edgeType },
        },
        create: { sourceNodeId, targetNodeId, edgeType, weight, evidenceCount: 1 },
        update: { weight, evidenceCount: { increment: 1 }, lastSeen: new Date() },
      });
      return true;
    } catch (err) {
      this.logger.warn(`Edge upsert failed (${sourceNodeId}<->${targetNodeId}): ${String(err)}`);
      return false;
    }
  }

  // ─────────────── Query ───────────────

  listNodes(filters: { indicatorType?: string; category?: string; limit?: number } = {}) {
    const where: Prisma.FraudGraphNodeWhereInput = {};
    if (
      filters.indicatorType &&
      (Object.values(IndicatorType) as string[]).includes(filters.indicatorType)
    ) {
      where.indicatorType = filters.indicatorType as IndicatorType;
    }
    if (filters.category) {
      where.category = filters.category.toUpperCase();
    }
    return this.prisma.fraudGraphNode.findMany({
      where,
      orderBy: [{ riskScore: 'desc' }, { signalCount: 'desc' }],
      take: Math.min(Math.max(filters.limit ?? 100, 1), 500),
    });
  }

  async getNode(id: string): Promise<FraudGraphNode> {
    const node = await this.prisma.fraudGraphNode.findUnique({ where: { id } });
    if (!node) throw new NotFoundException('Fraud graph node not found');
    return node;
  }

  /** Neighbors of a node, with the connecting edge metadata. */
  async getNeighbors(id: string, limit = NEIGHBOR_DEFAULT_LIMIT) {
    await this.getNode(id); // 404 if missing
    const edges = await this.prisma.fraudGraphEdge.findMany({
      where: { OR: [{ sourceNodeId: id }, { targetNodeId: id }] },
      orderBy: [{ weight: 'desc' }, { evidenceCount: 'desc' }],
      take: Math.min(Math.max(limit, 1), 200),
    });
    if (edges.length === 0) return [];
    const otherIds = edges.map((e) => (e.sourceNodeId === id ? e.targetNodeId : e.sourceNodeId));
    const others = await this.prisma.fraudGraphNode.findMany({
      where: { id: { in: otherIds } },
    });
    const map = new Map(others.map((n) => [n.id, n]));
    return edges
      .map((e) => {
        const neighborId = e.sourceNodeId === id ? e.targetNodeId : e.sourceNodeId;
        const neighbor = map.get(neighborId);
        if (!neighbor) return null;
        return {
          edgeType: e.edgeType,
          weight: e.weight,
          evidenceCount: e.evidenceCount,
          firstSeen: e.firstSeen,
          lastSeen: e.lastSeen,
          neighbor: {
            id: neighbor.id,
            indicatorType: neighbor.indicatorType,
            normalizedIndicator: neighbor.normalizedIndicator,
            label: neighbor.label,
            category: neighbor.category,
            signalCount: neighbor.signalCount,
            riskScore: neighbor.riskScore,
          },
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }
}
