import { Injectable, Logger } from '@nestjs/common';
import { AIDecision, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NlpClient } from './nlp.client';
import { NlpClassificationInput, NlpClassificationOutput } from './nlp.types';

const SNIPPET_LEN = 200;

export interface ClassifyContext {
  entityType?: string;
  entityId?: string;
}

export interface ClassifyResult {
  output: NlpClassificationOutput;
  decision: AIDecision;
}

/**
 * NLP scam classification + audit (PDF non-negotiable #13). Every call —
 * stub or external — produces an AIDecision row capturing the model version,
 * an input digest, a truncated snippet, the verdict, and the latency.
 */
@Injectable()
export class NlpClassifierService {
  private readonly logger = new Logger(NlpClassifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: NlpClient,
  ) {}

  async classify(
    input: NlpClassificationInput,
    ctx: ClassifyContext = {},
  ): Promise<ClassifyResult> {
    const start = Date.now();
    const inputDigest = createHash('sha256')
      .update(this.canonical(input))
      .digest('hex');
    const inputSnippet = (input.text ?? '').slice(0, SNIPPET_LEN) || null;

    const { output, source } = await this.client.classify(input);
    const durationMs = Date.now() - start;

    const decision = await this.prisma.aIDecision.create({
      data: {
        serviceKind: 'NLP_CLASSIFIER',
        modelVersion: output.modelVersion,
        source,
        entityType: ctx.entityType,
        entityId: ctx.entityId,
        inputDigest,
        inputSnippet,
        output: output as unknown as Prisma.InputJsonValue,
        confidence: output.scamScore,
        durationMs,
      },
    });
    return { output, decision };
  }

  /** Stable serialization for the input digest — keys in declared order. */
  private canonical(input: NlpClassificationInput): string {
    return JSON.stringify({
      text: input.text,
      indicatorType: input.indicatorType ?? null,
      hintedCategory: input.hintedCategory ?? null,
    });
  }
}
