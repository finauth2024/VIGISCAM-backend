import { computeEventHash, HashableEvent, stableStringify } from './evidence.hash';

const base: HashableEvent = {
  sequence: 1,
  tenantId: 'tenant-1',
  actorId: 'user-1',
  actorType: 'USER',
  entityType: 'SESSION',
  entityId: 'session-1',
  eventType: 'SESSION_STARTED',
  eventDescription: 'A session started',
  metadata: { foo: 'bar', count: 2 },
  ipAddress: '127.0.0.1',
  deviceId: null,
  occurredAt: new Date('2026-01-01T00:00:00.000Z'),
  previousHash: null,
};

describe('evidence hash chain', () => {
  it('is deterministic for identical content', () => {
    expect(computeEventHash(base)).toBe(computeEventHash({ ...base }));
  });

  it('ignores property order within metadata', () => {
    const reordered: HashableEvent = { ...base, metadata: { count: 2, foo: 'bar' } };
    expect(computeEventHash(reordered)).toBe(computeEventHash(base));
  });

  it('changes when a content field is altered (tamper detection)', () => {
    const tampered: HashableEvent = { ...base, eventDescription: 'A session started (edited)' };
    expect(computeEventHash(tampered)).not.toBe(computeEventHash(base));
  });

  it('changes when the previous-chain link changes', () => {
    const relinked: HashableEvent = { ...base, previousHash: 'deadbeef' };
    expect(computeEventHash(relinked)).not.toBe(computeEventHash(base));
  });

  it('stableStringify sorts object keys', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});
