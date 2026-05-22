import { RegistryEntry } from '@prisma/client';
import { toPublicRegistryEntry } from './registry.mapper';

const storedEntry: RegistryEntry = {
  id: 'entry-1',
  indicatorType: 'DOMAIN',
  indicatorValue: 'scam-login.example.com',
  normalizedIndicator: 'scam-login.example.com',
  category: 'CRYPTO_SCAM',
  status: 'PUBLISHED',
  confidenceScore: 88,
  publicSafeSummary: 'Verified scam domain used in crypto investment fraud.',
  recommendedAction: 'DO_NOT_VISIT_OR_ENTER_DETAILS',
  firstSeen: new Date('2026-01-01'),
  lastSeen: new Date('2026-02-01'),
  evidenceCount: 5,
  sourceSignalId: 'signal-internal-1',
  approvedByUserId: 'admin-internal-1',
  approvedAt: new Date('2026-02-02'),
  publishedAt: new Date('2026-02-03'),
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-02-03'),
};

describe('public registry mapper', () => {
  it('exposes the public-safe fields', () => {
    const pub = toPublicRegistryEntry(storedEntry);
    expect(pub.indicator).toBe('scam-login.example.com');
    expect(pub.summary).toBe('Verified scam domain used in crypto investment fraud.');
    expect(pub.riskLevel).toBe('CRITICAL'); // confidence 88 -> CRITICAL
    expect(pub.evidenceCount).toBe(5);
  });

  it('never leaks internal fields', () => {
    const pub = toPublicRegistryEntry(storedEntry) as unknown as Record<string, unknown>;
    expect(pub.sourceSignalId).toBeUndefined();
    expect(pub.approvedByUserId).toBeUndefined();
    expect(pub.approvedAt).toBeUndefined();
    expect(pub.normalizedIndicator).toBeUndefined();
    expect(pub.confidenceScore).toBeUndefined();
    expect(pub.status).toBeUndefined();
  });
});
