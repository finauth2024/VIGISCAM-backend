import { Injectable, NotFoundException } from '@nestjs/common';
import { ClusterMatchType, ClusterStatus, Prisma, ScamCluster, ScamSignal } from '@prisma/client';
import { RequestContext } from '../../common/auth/auth.types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../evidence-vault/evidence.service';
import { deriveClusterKey } from './clustering';

/**
 * Scam-signal clustering (PDF §32). Connects individual signals into patterns
 * so repeated scam infrastructure is visible as one unit. Clustering is
 * intelligence-only — it never changes a signal's verification status, and
 * nothing here is public. Each link is written to the Evidence Vault.
 */
@Injectable()
export class ClusterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidence: EvidenceService,
  ) {}

  /**
   * Auto-cluster a signal by its shared indicator pattern. Returns the cluster
   * it was linked to, or null if the signal's type is not auto-clustered.
   */
  async clusterSignal(signal: ScamSignal, ctx: RequestContext = {}): Promise<ScamCluster | null> {
    const derived = deriveClusterKey(signal.indicatorType, signal.normalizedIndicator);
    if (!derived) {
      return null;
    }

    const existing = await this.prisma.scamCluster.findUnique({
      where: { clusterKey: derived.key },
    });
    const cluster =
      existing ??
      (await this.prisma.scamCluster.create({
        data: {
          clusterKey: derived.key,
          matchType: derived.matchType,
          label: derived.label,
          category: signal.category,
        },
      }));

    const alreadyLinked = signal.clusterId === cluster.id;
    if (!alreadyLinked) {
      await this.prisma.scamSignal.update({
        where: { id: signal.id },
        data: { clusterId: cluster.id },
      });
    }

    const updated = await this.recount(cluster.id);

    // Log only a meaningful change — a new cluster, or a newly linked signal.
    if (!existing || !alreadyLinked) {
      await this.evidence.append({
        tenantId: null,
        actorType: 'SYSTEM',
        entityType: 'SCAM_CLUSTER',
        entityId: cluster.id,
        eventType: existing ? 'CLUSTER_LINKED' : 'CLUSTER_CREATED',
        eventDescription: existing
          ? `Signal linked to scam cluster (${derived.label})`
          : `Scam cluster created (${derived.label})`,
        metadata: { matchType: derived.matchType, signalId: signal.id },
        ipAddress: ctx.ip ?? null,
      });
    }
    return updated;
  }

  /** List clusters, optionally filtered by status and match type. */
  listClusters(status?: string, matchType?: string): Promise<ScamCluster[]> {
    const where: Prisma.ScamClusterWhereInput = {};
    if ((Object.values(ClusterStatus) as string[]).includes(status ?? '')) {
      where.status = status as ClusterStatus;
    }
    if ((Object.values(ClusterMatchType) as string[]).includes(matchType ?? '')) {
      where.matchType = matchType as ClusterMatchType;
    }
    return this.prisma.scamCluster.findMany({
      where,
      orderBy: { lastSeen: 'desc' },
      take: 200,
    });
  }

  /** A single cluster with its member signals. */
  async getCluster(id: string) {
    const cluster = await this.prisma.scamCluster.findUnique({
      where: { id },
      include: { signals: { orderBy: { lastSeen: 'desc' }, take: 200 } },
    });
    if (!cluster) {
      throw new NotFoundException('Scam cluster not found');
    }
    return cluster;
  }

  /** Recompute a cluster's aggregates from its current member signals. */
  private async recount(clusterId: string): Promise<ScamCluster> {
    const agg = await this.prisma.scamSignal.aggregate({
      where: { clusterId },
      _count: { _all: true },
      _min: { firstSeen: true },
      _max: { lastSeen: true, confidenceScore: true },
    });
    return this.prisma.scamCluster.update({
      where: { id: clusterId },
      data: {
        signalCount: agg._count._all,
        confidenceScore: agg._max.confidenceScore ?? 0,
        firstSeen: agg._min.firstSeen ?? undefined,
        lastSeen: agg._max.lastSeen ?? undefined,
      },
    });
  }
}
