import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { FraudGraphEdge, FraudGraphNode, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { ExportClusterDto } from './dto/export-cluster.dto';
import { SearchGraphDto } from './dto/search-graph.dto';
import { mask } from './masker';

/**
 * Identity Collision Graph™ (Phase 9G).
 *
 * Wraps the underlying `fraud_graph_nodes` / `fraud_graph_edges` tables
 * with a PII-safe read surface. Two surfaces:
 *
 *   - `search(q)` — case-insensitive lookup across label +
 *      normalizedIndicator, returning **masked** display values for
 *      sensitive node types. Internal investigators see the cluster
 *      shape without seeing victim PII verbatim.
 *
 *   - `exportCluster(campaignNodeId)` — collect every node + edge
 *     reachable from a CAMPAIGN node (one BFS hop is enough at the
 *     current scale), write the snapshot as an IDENTITY_COLLISION_REPORT
 *     evidence event, and return the snapshot. Reviewers use this to
 *     produce shareable, auditable cluster reports.
 *
 * Phase 11B will inject real-time graph-match scores into ClaimVerify
 * / WalletGuard via the existing `graphMatchScore` slots on those
 * checks. This module owns the read + export side only.
 */
@Injectable()
export class IdentityGraphService {
  private readonly logger = new Logger(IdentityGraphService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
  ) {}

  async search(dto: SearchGraphDto): Promise<
    Array<{
      id: string;
      nodeType: string;
      display: string;
      category: string | null;
      riskScore: number;
      signalCount: number;
      firstSeen: Date;
      lastSeen: Date;
    }>
  > {
    const limit = Math.min(Math.max(dto.limit ?? 50, 1), 200);
    const q = dto.q.toLowerCase();

    const where: Prisma.FraudGraphNodeWhereInput = {
      AND: [
        {
          OR: [
            { label: { contains: q, mode: 'insensitive' } },
            { normalizedIndicator: { contains: q, mode: 'insensitive' } },
          ],
        },
        dto.nodeTypes && dto.nodeTypes.length > 0 ? { nodeType: { in: dto.nodeTypes } } : {},
        dto.indicatorType ? { indicatorType: dto.indicatorType } : {},
      ],
    };

    const rows = await this.prisma.fraudGraphNode.findMany({
      where,
      orderBy: [{ riskScore: 'desc' }, { signalCount: 'desc' }],
      take: limit,
    });

    return rows.map(this.toMaskedSearchResult);
  }

  async exportCluster(
    user: AuthenticatedUser,
    campaignNodeId: string,
    dto: ExportClusterDto,
  ): Promise<{
    cluster: ClusterSnapshot;
    evidenceEventId: string;
  }> {
    const campaign = await this.prisma.fraudGraphNode.findUnique({
      where: { id: campaignNodeId },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign node not found');
    }
    if (campaign.nodeType !== 'CAMPAIGN') {
      throw new NotFoundException('Export expects a CAMPAIGN node id');
    }

    const edges = await this.prisma.fraudGraphEdge.findMany({
      where: {
        OR: [{ sourceNodeId: campaignNodeId }, { targetNodeId: campaignNodeId }],
      },
    });
    const memberIds = new Set<string>();
    for (const e of edges) {
      memberIds.add(e.sourceNodeId);
      memberIds.add(e.targetNodeId);
    }
    memberIds.delete(campaignNodeId);

    const members = await this.prisma.fraudGraphNode.findMany({
      where: { id: { in: [...memberIds] } },
    });

    const snapshot = this.buildSnapshot(campaign, members, edges);

    const ev = await this.evidence.append({
      tenantId: user.tenantId,
      actorId: user.userId,
      actorType: 'REVIEWER',
      entityType: 'FRAUD_GRAPH_CAMPAIGN',
      entityId: campaign.id,
      eventType: 'IDENTITY_COLLISION_REPORT',
      eventDescription:
        `Identity Collision Graph export for campaign "${campaign.label}" ` +
        `(${members.length} members, ${edges.length} edges)`,
      metadata: {
        campaignLabel: campaign.label,
        memberCount: members.length,
        edgeCount: edges.length,
        notes: dto.notes ?? null,
      },
    });

    this.logger.log(
      `Identity Graph cluster export: campaign=${campaign.id} ` +
        `members=${members.length} evidence=${ev.id}`,
    );

    return { cluster: snapshot, evidenceEventId: ev.id };
  }

  private toMaskedSearchResult = (node: FraudGraphNode) => ({
    id: node.id,
    nodeType: node.nodeType,
    display: mask({
      nodeType: node.nodeType,
      normalizedIndicator: node.normalizedIndicator,
      displayMask: node.displayMask,
      label: node.label,
    }),
    category: node.category,
    riskScore: node.riskScore,
    signalCount: node.signalCount,
    firstSeen: node.firstSeen,
    lastSeen: node.lastSeen,
  });

  private buildSnapshot(
    campaign: FraudGraphNode,
    members: FraudGraphNode[],
    edges: FraudGraphEdge[],
  ): ClusterSnapshot {
    return {
      campaign: {
        id: campaign.id,
        label: campaign.label,
        category: campaign.category,
        riskScore: campaign.riskScore,
        signalCount: campaign.signalCount,
        firstSeen: campaign.firstSeen,
        lastSeen: campaign.lastSeen,
      },
      members: members.map(this.toMaskedSearchResult),
      edges: edges.map((e) => ({
        id: e.id,
        edgeType: e.edgeType,
        weight: e.weight,
        evidenceCount: e.evidenceCount,
        sourceNodeId: e.sourceNodeId,
        targetNodeId: e.targetNodeId,
      })),
    };
  }
}

interface ClusterSnapshot {
  campaign: {
    id: string;
    label: string;
    category: string | null;
    riskScore: number;
    signalCount: number;
    firstSeen: Date;
    lastSeen: Date;
  };
  members: Array<{
    id: string;
    nodeType: string;
    display: string;
    category: string | null;
    riskScore: number;
    signalCount: number;
    firstSeen: Date;
    lastSeen: Date;
  }>;
  edges: Array<{
    id: string;
    edgeType: string;
    weight: number;
    evidenceCount: number;
    sourceNodeId: string;
    targetNodeId: string;
  }>;
}
