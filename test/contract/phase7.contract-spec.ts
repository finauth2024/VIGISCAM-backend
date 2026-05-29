/**
 * Phase 7 end-to-end contract smoke. Mirrors the curl suite that signed off
 * the Azure dev environment.
 *
 * The flow is sequential and shares state across `it` blocks: signal →
 * verify → candidate → approve → publish → graph node → auto-takedown →
 * partner key → public alert. Each step is its own `it` so a failure points
 * at the exact step in CI output.
 *
 * If CONTRACT_API_BASE / CONTRACT_ADMIN_EMAIL / CONTRACT_ADMIN_PASSWORD are
 * unset the entire suite is skipped — keeping the default `npm test` green.
 */
import {
  ApiCaller,
  INTERNAL_TENANT_ID,
  disposeContractPrisma,
  getContractPrisma,
  loadEnv,
  login,
  uniqueDomain,
} from './helpers';

const env = loadEnv();
const describeIfConfigured = env ? describe : describe.skip;

describeIfConfigured('Phase 7 deploy smoke (contract)', () => {
  const e = env!;
  let api: ApiCaller;
  let signalId: string;
  let registryId: string;
  const domain = uniqueDomain('contract-paypal');

  beforeAll(async () => {
    const token = await login(e);
    api = new ApiCaller(e.baseUrl, token);
  });

  afterAll(async () => {
    await disposeContractPrisma();
  });

  it('A1: submits a scam report', async () => {
    const res = await api.call<{ signalId: string }>('/scam-reports', {
      anonymous: true, // public endpoint
      body: {
        indicatorType: 'DOMAIN',
        indicatorValue: domain,
        category: 'PHISHING',
        description: 'Contract smoke — fake bank verify page',
      },
    });
    expect(res.status).toBe(202);
    expect(res.data.signalId).toMatch(/^[0-9a-f-]{36}$/);
    signalId = res.data.signalId;
  });

  it('A2: reviewer promotes the signal to verified intelligence', async () => {
    const res = await api.call<{ signal: { status: string } }>(
      `/intelligence/signals/${signalId}/review`,
      { body: { decision: 'PROMOTE_TO_VERIFIED', notes: 'contract' } },
    );
    expect(res.status).toBe(200);
    expect(res.data.signal.status).toBe('VERIFIED_SCAM_INTELLIGENCE');
  });

  it('A3 (optional): seeds OSINT row so 7D regex has something to match', async () => {
    const prisma = getContractPrisma(e);
    if (!prisma) {
      console.warn('OSINT seed skipped — DATABASE_URL not set; 7D assertion will skip too');
      return;
    }
    await prisma.osintEnrichment.upsert({
      where: {
        indicatorType_normalizedIndicator_provider: {
          indicatorType: 'DOMAIN',
          normalizedIndicator: domain,
          provider: 'whois-stub',
        },
      },
      create: {
        signalId,
        indicatorType: 'DOMAIN',
        normalizedIndicator: domain,
        provider: 'whois-stub',
        modelVersion: 'v1',
        source: 'STUB',
        data: { registrar: 'GoDaddy.com, LLC' },
      },
      update: { data: { registrar: 'GoDaddy.com, LLC' } },
    });
  });

  it('A4: creates a registry candidate', async () => {
    const res = await api.call<{ id: string }>('/intelligence/registry/candidates', {
      body: {
        signalId,
        publicStatus: 'VERIFIED_MALICIOUS',
        publicSafeSummary: 'Domain impersonating bank account verification.',
        category: 'PHISHING',
      },
    });
    expect(res.status).toBe(201);
    expect(res.data.id).toMatch(/^[0-9a-f-]{36}$/);
    registryId = res.data.id;
  });

  it('A5: approves the candidate', async () => {
    const res = await api.call<{ status: string }>(`/intelligence/registry/${registryId}/approve`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('APPROVED_PUBLIC_SAFE');
  });

  it('A6: publishes the entry (triggers 7B node + 7D auto-takedown)', async () => {
    const res = await api.call<{ status: string }>(`/intelligence/registry/${registryId}/publish`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('PUBLISHED');
  });

  it('B (7B): the fraud-graph indicator node exists', async () => {
    const res = await api.call<Array<{ normalizedIndicator: string; riskScore: number }>>(
      '/intelligence/graph/nodes?indicatorType=DOMAIN&limit=500',
    );
    expect(res.status).toBe(200);
    const node = res.data.find((n) => n.normalizedIndicator === domain);
    expect(node).toBeDefined();
    expect(node!.riskScore).toBeGreaterThan(0);
  });

  it('C (7D): an auto-drafted takedown exists when OSINT was seeded', async () => {
    if (!e.databaseUrl) {
      console.warn('Skipping 7D assertion — DATABASE_URL not set');
      return;
    }
    const res =
      await api.call<Array<{ registryEntryId: string; providerName: string; status: string }>>(
        '/intelligence/takedowns',
      );
    expect(res.status).toBe(200);
    const match = res.data.find((t) => t.registryEntryId === registryId);
    expect(match).toBeDefined();
    expect(match!.providerName).toBe('GoDaddy');
    expect(match!.status).toBe('DRAFT');
  });

  it('D (7E): partner key on INTERNAL tenant returns rawKey + plan', async () => {
    const res = await api.call<{
      rawKey: string;
      key: { id: string; plan: string };
    }>('/admin/partner-keys', {
      body: {
        tenantId: INTERNAL_TENANT_ID,
        label: 'contract test',
        scopes: ['READ_TENANT_INTEL'],
        plan: 'FREE',
      },
    });
    expect(res.status).toBe(201);
    expect(res.data.rawKey).toMatch(/^vsk_[0-9a-f]{40}$/);
    expect(res.data.key.plan).toBe('FREE');
  });

  it('E (7F): publishes a public alert and serves it with ETag + 304', async () => {
    const create = await api.call<{ id: string }>('/admin/public-alerts', {
      body: {
        title: 'Contract test alert',
        body: 'Avoid suspicious bank verification links.',
        severity: 'WARNING',
        region: 'US',
      },
    });
    expect(create.status).toBe(201);
    const alertId = create.data.id;

    const publish = await api.call<{ status: string }>(`/admin/public-alerts/${alertId}/status`, {
      body: { status: 'PUBLISHED' },
    });
    expect(publish.status).toBe(200);
    expect(publish.data.status).toBe('PUBLISHED');

    // Public read at the renamed path (commit 63063bd)
    const first = await api.call<Array<{ id: string }>>('/public-alerts?region=US', {
      anonymous: true,
    });
    expect(first.status).toBe(200);
    const etag = first.headers.get('etag');
    expect(etag).toBeTruthy();
    expect(first.data.some((a) => a.id === alertId)).toBe(true);

    // ETag round-trip
    const second = await api.call('/public-alerts?region=US', {
      anonymous: true,
      extraHeaders: { 'If-None-Match': etag! },
    });
    expect(second.status).toBe(304);
  });
});
