import { ScamCluster } from '@prisma/client';
import { suggestionForCluster } from './suggestions';

function cluster(overrides: Partial<ScamCluster>): ScamCluster {
  return {
    id: 'cluster-1',
    clusterKey: 'domain-root:scam-bank.com',
    matchType: 'SHARED_DOMAIN_ROOT',
    label: 'Domain root — scam-bank.com',
    category: 'BANK_IMPERSONATION',
    status: 'ACTIVE',
    signalCount: 5,
    confidenceScore: 82,
    firstSeen: new Date(),
    lastSeen: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('rule suggestions', () => {
  it('suggests a domain-root INDICATOR_PATTERN from a SHARED_DOMAIN_ROOT cluster', () => {
    const s = suggestionForCluster(cluster({}));
    expect(s).not.toBeNull();
    expect(s!.ruleType).toBe('INDICATOR_PATTERN');
    expect(s!.pattern).toEqual({
      indicatorType: 'DOMAIN',
      match: 'DOMAIN_ROOT',
      root: 'scam-bank.com',
    });
    expect(s!.sourceClusterId).toBe('cluster-1');
    expect(s!.severity).toBe('HIGH'); // confidence 82 -> HIGH
    expect(s!.name).toContain('scam-bank.com');
  });

  it('suggests an email-domain INDICATOR_PATTERN from a SHARED_EMAIL cluster', () => {
    const s = suggestionForCluster(
      cluster({
        matchType: 'SHARED_EMAIL',
        clusterKey: 'email-domain:fraud-team.net',
        label: 'Email domain — fraud-team.net',
        confidenceScore: 88,
      }),
    );
    expect(s).not.toBeNull();
    expect(s!.pattern).toEqual({
      indicatorType: 'EMAIL',
      match: 'EMAIL_DOMAIN',
      domain: 'fraud-team.net',
    });
    expect(s!.severity).toBe('CRITICAL'); // confidence 88 -> CRITICAL
  });

  it('does not auto-suggest for unsupported match types', () => {
    expect(suggestionForCluster(cluster({ matchType: 'MANUAL' }))).toBeNull();
    expect(suggestionForCluster(cluster({ matchType: 'SHARED_PHONE' }))).toBeNull();
    expect(suggestionForCluster(cluster({ matchType: 'SHARED_PHRASE' }))).toBeNull();
  });

  it('propagates the cluster category onto the suggested rule', () => {
    const s = suggestionForCluster(cluster({ category: 'CRYPTO_SCAM' }));
    expect(s!.category).toBe('CRYPTO_SCAM');
  });
});
