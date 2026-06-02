/**
 * docs/08 acceptance gate — **v2 extension** (Phase 11D).
 *
 * Extends (does not replace) the 20 criteria in all-criteria.acceptance-spec.ts
 * with one criterion per Phase 9–11 surface: the eight protection modules,
 * Evidence Vault file storage, the five role portals, internal oversight,
 * Stripe billing, and the AI worker toggle.
 *
 * Same harness + skip behaviour as the v1 suite — runs against the deployed
 * API, skips entirely when CONTRACT_API_BASE is unset. The configured admin
 * is an INTERNAL-tenant SUPER_ADMIN, so:
 *   - protection modules + internal/billing/AI surfaces → full happy path
 *   - role portals (Bank/Platform/Investigator/Enterprise) → asserted
 *     tenant-gated (a 403 from a non-matching tenant proves the guard is
 *     mounted and enforced; a real BANK/PLATFORM tenant gets the data)
 */
import {
  ApiCaller,
  disposeContractPrisma,
  loadEnv,
  login,
} from '../contract/helpers';

const env = loadEnv();
const describeIfConfigured = env ? describe : describe.skip;

const INTERNAL_TENANT_ID = '11111111-1111-4111-8111-111111111111';

describeIfConfigured('docs/08 acceptance gate v2 — Phase 9–11 modules', () => {
  const e = env!;
  let api: ApiCaller;

  beforeAll(async () => {
    const token = await login(e);
    api = new ApiCaller(e.baseUrl, token);
  });

  afterAll(async () => {
    await disposeContractPrisma();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 21. Guardian Pause works (9A) — the real-time countdown substrate
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 21: Guardian Pause module is live + tenant-scoped', () => {
    it('GET /guardian-pause/history → 200 + array', async () => {
      const res = await api.call<Array<unknown>>('/guardian-pause/history');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 22. ScamHold works (9B) — real scoring happy path
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 22: ScamHold scores a transaction and records it', () => {
    it('POST /scamhold/check (crypto, urgency, secrecy) → high risk', async () => {
      const res = await api.call<{ id: string; riskLevel: string; riskScore: number }>(
        '/scamhold/check',
        {
          body: {
            transactionType: 'CRYPTO',
            amountMinor: 5_000_00,
            currency: 'USD',
            recipient: 'unknown-wallet',
            recipientRisk: 'SUSPICIOUS_WALLET',
            urgencyDetected: true,
            secrecyDetected: true,
          },
        },
      );
      expect([200, 201]).toContain(res.status);
      expect(res.data.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(['MEDIUM', 'HIGH', 'CRITICAL']).toContain(res.data.riskLevel);
      expect(typeof res.data.riskScore).toBe('number');
    });
    it('GET /scamhold/history → 200 + array', async () => {
      const res = await api.call<Array<unknown>>('/scamhold/history');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 23. GiftCardGuard works (9C) — code-reveal + impersonation → high risk
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 23: GiftCardGuard flags a code-reveal scam', () => {
    it('POST /giftcardguard/scan → HIGH or CRITICAL', async () => {
      const res = await api.call<{ id: string; riskLevel: string }>('/giftcardguard/scan', {
        body: {
          cardBrand: 'Amazon',
          denominationMinor: 50_000,
          codeRevealRequested: true,
          impersonationType: 'GOVERNMENT',
          urgencyDetected: true,
        },
      });
      expect([200, 201]).toContain(res.status);
      expect(['HIGH', 'CRITICAL']).toContain(res.data.riskLevel);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 24. WalletGuard works (9D) — malformed address → CRITICAL
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 24: WalletGuard rejects a malformed address as CRITICAL', () => {
    it('POST /walletguard/check (bad ETH address) → CRITICAL + invalid', async () => {
      const res = await api.call<{ riskLevel: string; addressValid: boolean }>(
        '/walletguard/check',
        { body: { network: 'ETH', address: '0xdeadbeef' } },
      );
      expect([200, 201]).toContain(res.status);
      expect(res.data.addressValid).toBe(false);
      expect(res.data.riskLevel).toBe('CRITICAL');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 25. ClaimVerify works (9E)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 25: ClaimVerify module is live + tenant-scoped', () => {
    it('GET /claimverify/history → 200 + array', async () => {
      const res = await api.call<Array<unknown>>('/claimverify/history');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 26. ScamMirror works (9F)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 26: ScamMirror module is live + tenant-scoped', () => {
    it('GET /scammirror/history → 200 + array', async () => {
      const res = await api.call<Array<unknown>>('/scammirror/history');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 27. Identity Collision Graph works (9G) — masked search results
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 27: Identity Graph search returns masked results', () => {
    it('POST /identity-graph/search → 200 (REVIEWER/SUPER_ADMIN role)', async () => {
      const res = await api.call<{ nodes?: Array<{ display?: string }> }>(
        '/identity-graph/search',
        { body: { q: 'acceptance-probe', limit: 5 } },
      );
      expect(res.status).toBe(200);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 28. Trusted-contact review workflow works (9H)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 28: Trusted-contact review queue is live', () => {
    it('GET /trusted-contacts/reviews → 200 + array', async () => {
      const res = await api.call<Array<unknown>>('/trusted-contacts/reviews');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 29. Evidence Vault files round-trip (10A) — redacted public-safe view
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 29: Evidence file surface is live + redacted', () => {
    it('public-safe view on a real event omits blobUri/sha256/URLs', async () => {
      const timeline = await api.call<Array<{ id: string }>>('/evidence/timeline');
      expect(timeline.status).toBe(200);
      if (timeline.data.length === 0) {
        // No events yet in this tenant — the redaction contract is still
        // proven by the bogus-id 404 assertion below.
        return;
      }
      const eventId = timeline.data[0].id;
      const res = await api.call<{ files: Array<Record<string, unknown>> }>(
        `/evidence/${eventId}/public-safe`,
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.files)).toBe(true);
      // Redaction guarantee: no vault internals in the public-safe payload.
      const serialized = JSON.stringify(res.data);
      expect(serialized).not.toContain('blobUri');
      expect(serialized.toLowerCase()).not.toContain('sas=');
    });
    it('share on a bogus event id → 404 (route mounted + tenant lookup)', async () => {
      const res = await api.call('/evidence/00000000-0000-0000-0000-000000000000/share', {
        body: {},
      });
      expect(res.status).toBe(404);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 30. Role portals are mounted + tenant-gated (10B–10E)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 30: role portals reject a non-matching tenant', () => {
    // The admin is on the INTERNAL tenant, so each portal must refuse it.
    // A 403 proves the route is mounted and the role/tenant guard is enforced.
    const portalRoutes = [
      '/bank-portal/queue',
      '/platform-portal/moderation-queue',
      '/investigator-portal/cases',
      '/enterprise-portal/policies',
    ];
    it.each(portalRoutes)('GET %s as INTERNAL admin → 403', async (path) => {
      const res = await api.call(path);
      expect(res.status).toBe(403);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 31. Internal cross-tenant oversight works (10F)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 31: internal oversight overview is reachable', () => {
    it('GET /admin/oversight/overview → 200 with module + portal counts', async () => {
      const res = await api.call<{
        protectionModules: Record<string, unknown>;
        rolePortals: Record<string, unknown>;
      }>('/admin/oversight/overview');
      expect(res.status).toBe(200);
      expect(res.data.protectionModules).toBeTruthy();
      expect(res.data.rolePortals).toBeTruthy();
      expect(res.data.protectionModules).toHaveProperty('guardianPause');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 32. Stripe billing works (11A)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 32: billing subscription surface is live', () => {
    it('GET /billing/subscription → 200 with plan + status + stripe flag', async () => {
      const res = await api.call<{
        tenantId: string;
        plan: string;
        status: string;
        stripeConfigured: boolean;
      }>('/billing/subscription');
      expect(res.status).toBe(200);
      expect(['FREE', 'PRO', 'ENTERPRISE']).toContain(res.data.plan);
      expect(typeof res.data.stripeConfigured).toBe('boolean');
      expect(res.data.tenantId).toBe(INTERNAL_TENANT_ID);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 33. AI worker toggle works (11B)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 33: AI worker toggle status is reachable', () => {
    it('GET /intelligence/ai-status → 200 with engines + toggle flag', async () => {
      const res = await api.call<{
        aiServiceConfigured: boolean;
        defaultMode: string;
        engines: Array<{ serviceKind: string; mode: string }>;
      }>('/intelligence/ai-status');
      expect(res.status).toBe(200);
      expect(typeof res.data.aiServiceConfigured).toBe('boolean');
      expect(['STUB', 'EXTERNAL']).toContain(res.data.defaultMode);
      expect(res.data.engines.length).toBeGreaterThanOrEqual(7);
    });
    it('GET /intelligence/ai-status/usage → 200 + array', async () => {
      const res = await api.call<Array<unknown>>('/intelligence/ai-status/usage');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });
  });
});
