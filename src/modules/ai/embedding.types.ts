/**
 * Contract for the embedding service. The external Python service is expected
 * to expose POST `/embeddings` returning `{ vector, modelVersion }`. An
 * in-process stub (embedding-stub.ts) implements the same contract for dev /
 * CI when no AI_SERVICE_URL is configured.
 */

export interface EmbeddingInput {
  text: string;
}

export interface EmbeddingOutput {
  vector: number[];
  modelVersion: string;
}
