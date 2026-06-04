/**
 * CP-14 acceptance — the Review-Driven Completion Plan additions (CP-1 .. CP-13).
 *
 * The original gate (all-criteria + v2-modules, criteria 1–33) predates the
 * external reviewer's 14-point list. This spec adds criteria 34–41 so the
 * acceptance gate also proves the CP-1..CP-13 work landed and is reachable on
 * the deployed backend. Each `describe` maps to the CP it verifies.
 *
 * Run with `npm run test:acceptance`. Skips when CONTRACT_API_BASE (or the admin
 * creds) is unset, exactly like the sibling specs.
 */
import { randomUUID } from 'crypto';
import { ApiCaller, disposeContractPrisma, loadEnv, login } from '../contract/helpers';

const env = loadEnv();
const describeIfConfigured = env ? describe : describe.skip;

describeIfConfigured('CP-14 acceptance gate — review-completion additions', () => {
  const e = env!;
  let api: ApiCaller;
  let anon: ApiCaller;

  beforeAll(async () => {
    const token = await login(e);
    api = new ApiCaller(e.baseUrl, token);
    anon = new ApiCaller(e.baseUrl, '');
  });

  afterAll(async () => {
    await disposeContractPrisma();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 34. Protection Settings + Elder Mode controls (CP-1)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 34: protection settings + user profile (CP-1)', () => {
    it('GET /protection-settings → 200 with the per-module toggles + Elder Mode lock', async () => {
      const res = await api.call<Record<string, unknown>>('/protection-settings');
      expect(res.status).toBe(200);
      for (const key of [
        'scamHoldEnabled',
        'guardianPauseEnabled',
        'giftCardGuardEnabled',
        'walletGuardEnabled',
        'claimVerifyEnabled',
        'trustedContactRequired',
        'elderModeStrictLock',
        'allowContinueAnyway',
      ]) {
        expect(res.data).toHaveProperty(key);
        expect(typeof res.data[key]).toBe('boolean');
      }
    });

    it('GET /user-profile → 200', async () => {
      const res = await api.call('/user-profile');
      expect(res.status).toBe(200);
    });

    it('GET /protection-settings anonymously → 401', async () => {
      const res = await anon.call('/protection-settings', { anonymous: true });
      expect(res.status).toBe(401);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 35. OSINT provider layer is published + privacy-safe (CP-6)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 35: OSINT provider catalog (CP-6)', () => {
    it('GET /intelligence/osint/providers → 200, catalog entries expose no secrets', async () => {
      const res = await api.call<Array<Record<string, unknown>>>('/intelligence/osint/providers');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      expect(res.data.length).toBeGreaterThan(0);
      for (const provider of res.data) {
        expect(provider).toHaveProperty('name');
        expect(provider).toHaveProperty('category');
        // Privacy by construction — the catalog never leaks keys/credentials.
        const keys = Object.keys(provider).map((k) => k.toLowerCase());
        expect(
          keys.some((k) => k.includes('key') || k.includes('secret') || k.includes('token')),
        ).toBe(false);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 36. AI model registry + reviewer feedback loop (CP-7)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 36: model registry + AI review feedback loop (CP-7)', () => {
    it('GET /intelligence/models → 200 + array', async () => {
      const res = await api.call('/intelligence/models');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });

    it('GET /intelligence/ai-decisions/review-queue → 200 + array', async () => {
      const res = await api.call('/intelligence/ai-decisions/review-queue');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });

    it('GET /intelligence/ai-decisions/feedback-stats → 200', async () => {
      const res = await api.call('/intelligence/ai-decisions/feedback-stats');
      expect(res.status).toBe(200);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 37. Billing audit trail (CP-8)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 37: billing audit events (CP-8)', () => {
    it('GET /billing/events → 200 + array (every billing change is audited)', async () => {
      const res = await api.call('/billing/events');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 38. Queue health + admin metrics (CP-9, CP-10)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 38: queue admin metrics + worker health (CP-10)', () => {
    it('GET /admin/queues → 200 with redis state, workers, and per-queue counts', async () => {
      const res = await api.call<Record<string, unknown>>('/admin/queues');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('redisConnected');
      expect(res.data).toHaveProperty('workers');
      expect(res.data).toHaveProperty('queues');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 39. Evidence Vault export-bundle routes are mounted + access-controlled (CP-11)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 39: evidence export-bundle surface (CP-11)', () => {
    it('GET /evidence/bundles/:id with an unknown id → 404 (route mounted)', async () => {
      const res = await api.call(`/evidence/bundles/${randomUUID()}`);
      expect(res.status).toBe(404);
    });

    it('GET /evidence/bundles/:id anonymously → 401', async () => {
      const res = await anon.call(`/evidence/bundles/${randomUUID()}`, { anonymous: true });
      expect(res.status).toBe(401);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 40. RiskEvent master surface (CP-3)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 40: unified RiskEvent surface (CP-3)', () => {
    it('GET /risk-events → 200 + array', async () => {
      const res = await api.call('/risk-events');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 41. Consumer Identity Collision search is masked + validated (CP-13)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 41: consumer Identity Collision search (CP-13)', () => {
    it('POST /identity-collision/search → 200 with a masked collision envelope', async () => {
      const res = await api.call<{
        found: boolean;
        nodes: Array<Record<string, unknown>>;
      }>('/identity-collision/search', {
        body: { query: 'acceptance-probe', searchType: 'handle' },
      });
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('found');
      expect(res.data).toHaveProperty('matchCount');
      expect(res.data).toHaveProperty('nodes');
      // Any returned node exposes ONLY presentation fields — never raw PII / ids.
      for (const node of res.data.nodes ?? []) {
        expect(Object.keys(node).sort()).toEqual(['risk', 'role', 'type', 'value']);
      }
    });

    it('POST /identity-collision/search without searchType → 400 (validation)', async () => {
      const res = await api.call('/identity-collision/search', { body: { query: 'x' } });
      expect(res.status).toBe(400);
    });

    it('POST /identity-collision/search anonymously → 401', async () => {
      const res = await anon.call('/identity-collision/search', {
        anonymous: true,
        body: { query: 'x', searchType: 'handle' },
      });
      expect(res.status).toBe(401);
    });
  });
});
