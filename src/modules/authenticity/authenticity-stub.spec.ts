import { stubAuthenticityCheck, STUB_AUTHENTICITY_VERSION } from './authenticity-stub';
import { AuthenticityRequest } from './authenticity.types';

function req(overrides: Partial<AuthenticityRequest> = {}): AuthenticityRequest {
  return {
    checkType: 'LIVE_FACE_SEAL',
    sessionId: 'session-1',
    payload: { frameHash: 'abc' },
    ...overrides,
  };
}

describe('authenticity stub', () => {
  it('returns INCONCLUSIVE when no payload is provided', () => {
    const r = stubAuthenticityCheck(req({ payload: undefined }));
    expect(r.result).toBe('INCONCLUSIVE');
    expect(r.score).toBe(50);
  });

  it('returns FAIL when the caller flags suspicion', () => {
    const r = stubAuthenticityCheck(req({ payload: { suspectedDeepfake: true } }));
    expect(r.result).toBe('FAIL');
    expect(r.score).toBe(30);
    expect(r.metadata).toMatchObject({ suspicionFlagged: true });
  });

  it('returns PASS with a deliberately sub-real score otherwise', () => {
    const r = stubAuthenticityCheck(req());
    expect(r.result).toBe('PASS');
    expect(r.score).toBeLessThanOrEqual(75); // never look like a real high-confidence pass
    expect(r.modelVersion).toBe(STUB_AUTHENTICITY_VERSION);
  });

  it('is deterministic for identical inputs', () => {
    const a = stubAuthenticityCheck(req({ payload: { frameHash: 'xyz', confidence: 0.9 } }));
    const b = stubAuthenticityCheck(req({ payload: { frameHash: 'xyz', confidence: 0.9 } }));
    expect(a).toEqual(b);
  });
});
