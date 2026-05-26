import { EmbeddingOutput } from './embedding.types';

/**
 * Deterministic in-process embedding (PDF §32 advanced version "embeddings-
 * based similarity"). Not semantically meaningful — it is a lexical
 * fingerprint based on character trigrams — but reproducible and good enough
 * to exercise the similarity pipeline end-to-end without an external model.
 *
 * Pipeline: lowercase + collapse whitespace -> bag of character trigrams ->
 * FNV-1a hashed into a fixed-dim float vector -> L2-normalise so dot product
 * equals cosine similarity.
 */

export const STUB_EMBEDDING_VERSION = 'embedding-stub-1.0.0';
export const STUB_EMBEDDING_DIMS = 64;

/** Standard FNV-1a 32-bit hash — fast, stable, no dependencies. */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function l2normalize(vec: number[]): number[] {
  let sumSq = 0;
  for (const v of vec) sumSq += v * v;
  const norm = Math.sqrt(sumSq);
  if (norm === 0) return vec.slice();
  return vec.map((v) => v / norm);
}

/** Empty / too-short text returns null — caller decides what to do. */
export function stubEmbed(text: string): EmbeddingOutput | null {
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (normalized.length < 3) {
    return null;
  }
  const vec = new Array<number>(STUB_EMBEDDING_DIMS).fill(0);
  for (let i = 0; i <= normalized.length - 3; i++) {
    const trigram = normalized.slice(i, i + 3);
    const idx = fnv1a(trigram) % STUB_EMBEDDING_DIMS;
    vec[idx] += 1;
  }
  return {
    vector: l2normalize(vec),
    modelVersion: STUB_EMBEDDING_VERSION,
  };
}

/** Cosine similarity. Assumes inputs are L2-normalised; otherwise still valid but slower than needed. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  // Clamp to [-1, 1] to absorb floating-point drift.
  if (dot > 1) return 1;
  if (dot < -1) return -1;
  return dot;
}
