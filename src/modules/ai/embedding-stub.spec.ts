import {
  cosineSimilarity,
  STUB_EMBEDDING_DIMS,
  STUB_EMBEDDING_VERSION,
  stubEmbed,
} from './embedding-stub';

describe('embedding stub', () => {
  it('returns null for empty / too-short text', () => {
    expect(stubEmbed('')).toBeNull();
    expect(stubEmbed('  ')).toBeNull();
    expect(stubEmbed('ab')).toBeNull();
  });

  it('produces a fixed-dimension L2-normalised vector', () => {
    const out = stubEmbed('Your account is locked, verify now')!;
    expect(out.modelVersion).toBe(STUB_EMBEDDING_VERSION);
    expect(out.vector).toHaveLength(STUB_EMBEDDING_DIMS);
    const norm = Math.sqrt(out.vector.reduce((s, v) => s + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('is deterministic — the same input produces the same vector', () => {
    const a = stubEmbed('safe account transfer')!;
    const b = stubEmbed('safe account transfer')!;
    expect(a.vector).toEqual(b.vector);
  });

  it('scores near-duplicate text higher than unrelated text', () => {
    const v1 = stubEmbed('Move funds to a safe account immediately, urgent action required.')!;
    const v2 = stubEmbed('Move funds to a safe account right now, please act urgently.')!;
    const v3 = stubEmbed('Reminder: dentist appointment tomorrow at 10am.')!;
    const nearDup = cosineSimilarity(v1.vector, v2.vector);
    const unrelated = cosineSimilarity(v1.vector, v3.vector);
    expect(nearDup).toBeGreaterThan(unrelated);
    expect(nearDup).toBeGreaterThan(0.5);
  });

  it('cosine of identical vectors is ~1', () => {
    const a = stubEmbed('hello world this is a test')!;
    expect(cosineSimilarity(a.vector, a.vector)).toBeCloseTo(1, 5);
  });

  it('cosine returns 0 for mismatched dimensions', () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });
});
