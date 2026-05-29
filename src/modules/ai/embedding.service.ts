import { Injectable, Logger } from '@nestjs/common';
import { Prisma, ScamSignal, SignalEmbedding } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { cosineSimilarity } from './embedding-stub';
import { EmbeddingClient } from './embedding.client';

const SNIPPET_LEN = 200;
const SIMILARITY_THRESHOLD = 0.7;
const TOP_N_SIMILAR = 5;
const SCAN_CAP = 5_000;

export interface EmbedSignalResult {
  embedding: SignalEmbedding;
  newSimilarityLinks: number;
}

/**
 * Embedding generation + similarity-link persistence (PDF §32 advanced
 * version "embeddings-based similarity"). At intake we:
 *   1. Embed the signal's text (stub or external).
 *   2. Upsert SignalEmbedding for the signal.
 *   3. Find top-N existing embeddings whose cosine ≥ threshold.
 *   4. Persist canonical SignalSimilarity links for the matches.
 *   5. Record an AIDecision row for traceability.
 * Best-effort throughout — never throws to the caller.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: EmbeddingClient,
  ) {}

  async embedSignal(signal: ScamSignal, text: string): Promise<EmbedSignalResult | null> {
    if (!text || text.trim().length < 3) {
      return null;
    }
    const start = Date.now();
    const result = await this.client.embed({ text });
    if (!result) {
      return null;
    }
    const { output, source } = result;
    const durationMs = Date.now() - start;

    const embedding = await this.prisma.signalEmbedding.upsert({
      where: { signalId: signal.id },
      create: {
        signalId: signal.id,
        modelVersion: output.modelVersion,
        source,
        vector: output.vector,
      },
      update: {
        modelVersion: output.modelVersion,
        source,
        vector: output.vector,
      },
    });

    // Audit the AI call (PDF non-negotiable #13).
    await this.prisma.aIDecision.create({
      data: {
        serviceKind: 'EMBEDDING',
        modelVersion: output.modelVersion,
        source,
        entityType: 'SCAM_SIGNAL',
        entityId: signal.id,
        inputDigest: createHash('sha256').update(text).digest('hex'),
        inputSnippet: text.slice(0, SNIPPET_LEN),
        output: { dims: output.vector.length, modelVersion: output.modelVersion },
        durationMs,
      },
    });

    const newLinks = await this.persistSimilar(signal.id, output.vector, output.modelVersion);
    return { embedding, newSimilarityLinks: newLinks };
  }

  /** Find similar signals to the given vector and persist canonical pair rows. */
  private async persistSimilar(
    signalId: string,
    vector: number[],
    modelVersion: string,
  ): Promise<number> {
    const candidates = await this.prisma.signalEmbedding.findMany({
      where: { signalId: { not: signalId }, modelVersion },
      take: SCAN_CAP,
    });

    const scored = candidates
      .map((c) => ({ otherId: c.signalId, score: cosineSimilarity(vector, c.vector) }))
      .filter((c) => c.score >= SIMILARITY_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_N_SIMILAR);

    let written = 0;
    for (const { otherId, score } of scored) {
      // Canonicalise pair order so (A,B) and (B,A) become the same row.
      const [aId, bId] = signalId < otherId ? [signalId, otherId] : [otherId, signalId];
      try {
        await this.prisma.signalSimilarity.upsert({
          where: {
            signalAId_signalBId_modelVersion: {
              signalAId: aId,
              signalBId: bId,
              modelVersion,
            },
          },
          create: { signalAId: aId, signalBId: bId, score, modelVersion },
          update: { score },
        });
        written++;
      } catch (err) {
        this.logger.warn(`Failed to persist similarity ${aId}<->${bId}: ${String(err)}`);
      }
    }
    return written;
  }

  /** List similar signals for one signal — ordered by descending score. */
  async listSimilarTo(signalId: string, limit = 20) {
    const links = await this.prisma.signalSimilarity.findMany({
      where: { OR: [{ signalAId: signalId }, { signalBId: signalId }] },
      orderBy: { score: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    if (links.length === 0) {
      return [];
    }
    const otherIds = links.map((l) => (l.signalAId === signalId ? l.signalBId : l.signalAId));
    const signals = await this.prisma.scamSignal.findMany({
      where: { id: { in: otherIds } },
      select: {
        id: true,
        indicatorType: true,
        indicatorValue: true,
        category: true,
        status: true,
        confidenceScore: true,
        clusterId: true,
      },
    });
    const map = new Map(signals.map((s) => [s.id, s]));
    return links
      .map((l) => {
        const otherId = l.signalAId === signalId ? l.signalBId : l.signalAId;
        const other = map.get(otherId);
        if (!other) return null;
        return {
          score: l.score,
          modelVersion: l.modelVersion,
          createdAt: l.createdAt,
          signal: other,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }
}
