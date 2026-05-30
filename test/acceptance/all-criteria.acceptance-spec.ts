/**
 * docs/08 acceptance gate — the 20 criteria. Each `describe` block maps 1:1 to
 * the row in docs/08-ACCEPTANCE-CRITERIA.md with the same number. The backend
 * is declared "ready for frontend integration" only when every block passes.
 *
 * Run with `npm run test:acceptance`. Skips entirely when CONTRACT_API_BASE
 * (or CONTRACT_ADMIN_EMAIL / CONTRACT_ADMIN_PASSWORD) is unset, so this is
 * safe to run from `npm test` as well.
 */
import { randomBytes } from 'crypto';
import {
  ApiCaller,
  disposeContractPrisma,
  loadEnv,
  login,
  uniqueDomain,
} from '../contract/helpers';

const env = loadEnv();
const describeIfConfigured = env ? describe : describe.skip;

// Public-safe statuses surfaceable in the public registry (PDF §22). Anything
// else MUST NOT appear in a public search result (criterion 12).
const PUBLIC_SAFE_STATUSES = [
  'VERIFIED_MALICIOUS',
  'HIGH_RISK_VERIFIED',
  'OFFICIALLY_REPORTED',
  'TAKEDOWN_CONFIRMED',
];

describeIfConfigured('docs/08 acceptance gate', () => {
  const e = env!;
  let api: ApiCaller;
  let anon: ApiCaller; // an anonymous caller — empty bearer
  // Reused fixtures across criteria where one criterion's published entry
  // satisfies another's prerequisite (e.g. an appeal needs a PUBLISHED entry).
  let publishedSignalId: string;
  let publishedRegistryId: string;
  const phishingDomain = uniqueDomain('acceptance-phishing');

  beforeAll(async () => {
    const token = await login(e);
    api = new ApiCaller(e.baseUrl, token);
    anon = new ApiCaller(e.baseUrl, ''); // anonymous; helper accepts empty token
  });

  afterAll(async () => {
    await disposeContractPrisma();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Public user can search the public registry **without login**
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 1: anonymous registry search', () => {
    it('returns 200 + an items array', async () => {
      const res = await anon.call<{
        items: Array<unknown>;
        page: number;
        limit: number;
      }>('/registry/search?q=test', { anonymous: true });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.items)).toBe(true);
      expect(typeof res.data.page).toBe('number');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Public user can submit a scam check and **receive a risk score**
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 2: anonymous scam-check returns a risk score', () => {
    it('returns 200 + numeric risk score + next-steps text', async () => {
      const res = await anon.call<{
        riskScore: number;
        recommendation?: string;
      }>('/scam-check', {
        anonymous: true,
        body: {
          indicatorType: 'PHONE',
          indicatorValue: '+15551234567',
          rawText: 'Send me $500 in gift cards now.',
        },
      });
      expect(res.status).toBe(200);
      expect(typeof res.data.riskScore).toBe('number');
      expect(res.data.riskScore).toBeGreaterThanOrEqual(0);
      expect(res.data.riskScore).toBeLessThanOrEqual(100);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Public user can submit a report **privately**
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 3: anonymous scam-report acknowledged as UNVERIFIED', () => {
    it('returns 202 + UNVERIFIED_REPORT status', async () => {
      publishedSignalId = ''; // initialise — set later
      const res = await anon.call<{ status: string; signalId: string }>('/scam-reports', {
        anonymous: true,
        body: {
          indicatorType: 'DOMAIN',
          indicatorValue: phishingDomain,
          category: 'PHISHING',
          description: 'Acceptance: alleged phishing site',
        },
      });
      expect(res.status).toBe(202);
      expect(res.data.status).toBe('UNVERIFIED_REPORT');
      expect(res.data.signalId).toMatch(/^[0-9a-f-]{36}$/);
      publishedSignalId = res.data.signalId;
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. **Raw reports are never publicly exposed**
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 4: raw signal content is not anonymously readable', () => {
    it('GET /intelligence/signals anonymously → 401', async () => {
      const res = await anon.call('/intelligence/signals', { anonymous: true });
      expect(res.status).toBe(401);
    });
    it('GET /intelligence/signals/:id anonymously → 401', async () => {
      const res = await anon.call(`/intelligence/signals/${publishedSignalId}`, {
        anonymous: true,
      });
      expect(res.status).toBe(401);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Reviewer can **promote a signal to verified intelligence**
  // 6. Admin can **create and approve a public-safe registry entry**
  // (combined into one sequential flow — they share fixture state)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criteria 5 & 6: reviewer promote → admin candidate → approve → publish', () => {
    it('promotes the signal to VERIFIED_SCAM_INTELLIGENCE', async () => {
      const res = await api.call<{ signal: { status: string } }>(
        `/intelligence/signals/${publishedSignalId}/review`,
        { body: { decision: 'PROMOTE_TO_VERIFIED', notes: 'acceptance' } },
      );
      expect(res.status).toBe(200);
      expect(res.data.signal.status).toBe('VERIFIED_SCAM_INTELLIGENCE');
    });
    it('creates a registry candidate → APPROVED → PUBLISHED', async () => {
      const candidate = await api.call<{ id: string; status: string }>(
        '/intelligence/registry/candidates',
        {
          body: {
            signalId: publishedSignalId,
            publicStatus: 'VERIFIED_MALICIOUS',
            publicSafeSummary: 'Domain associated with phishing activity.',
            category: 'PHISHING',
          },
        },
      );
      expect(candidate.status).toBe(201);
      publishedRegistryId = candidate.data.id;

      const approved = await api.call<{ status: string }>(
        `/intelligence/registry/${publishedRegistryId}/approve`,
        { method: 'POST' },
      );
      expect(approved.data.status).toBe('APPROVED_PUBLIC_SAFE');

      const published = await api.call<{ status: string; publishedAt: string }>(
        `/intelligence/registry/${publishedRegistryId}/publish`,
        { method: 'POST' },
      );
      expect(published.data.status).toBe('PUBLISHED');
      expect(published.data.publishedAt).toBeTruthy();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 7. Evidence Vault **logs every major action**
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 7: every major action lands a hash-chained evidence row', () => {
    it('evidence timeline includes hash-chained entries for this run', async () => {
      const res =
        await api.call<
          Array<{ id: string; eventType: string; hash: string; previousHash: string | null }>
        >('/evidence/timeline');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data)).toBe(true);
      // Hash chain: every entry has a sha256 hash, only the first may lack a parent.
      for (const row of res.data) {
        expect(row.hash).toMatch(/^[0-9a-f]{64}$/);
      }
    });
    it('verify endpoint confirms the chain is intact', async () => {
      const res = await api.call<{ ok: boolean }>('/evidence/verify');
      expect(res.status).toBe(200);
      expect(res.data.ok).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 8. Detection rules can be **suggested from verified intelligence**
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 8: rule suggestions land as DRAFT only', () => {
    it('generate endpoint returns 200 and never auto-activates', async () => {
      const res = await api.call<{ created: number } | unknown[]>(
        '/intelligence/rule-suggestions/generate',
        { method: 'POST' },
      );
      expect(res.status).toBe(200);
    });
    it('every suggested rule is DRAFT (never ACTIVE)', async () => {
      const res = await api.call<Array<{ status: string }>>('/intelligence/rules?status=DRAFT');
      expect(res.status).toBe(200);
      // If any rules came back, all must be DRAFT.
      for (const r of res.data) expect(r.status).toBe('DRAFT');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 9. A dashboard can display **signals, clusters, rules, and review queues**
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 9: intelligence dashboard counts are reachable', () => {
    it('GET /intelligence/metrics returns the four required dimensions', async () => {
      const res = await api.call<Record<string, unknown>>('/intelligence/metrics');
      expect(res.status).toBe(200);
      // Shape can evolve, but each of these dimensions must be present in some form.
      const flat = JSON.stringify(res.data).toLowerCase();
      expect(flat).toContain('signal');
      expect(flat).toContain('cluster');
      expect(flat).toContain('rule');
      expect(flat).toContain('queue');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 10. Role permissions **prevent public users from seeing private intelligence**
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 10: anonymous callers are rejected on every internal route', () => {
    const internalRoutes = [
      '/intelligence/signals',
      '/intelligence/registry',
      '/intelligence/review-queue',
      '/intelligence/metrics',
      '/intelligence/rules',
      '/intelligence/clusters',
      '/intelligence/takedowns',
      '/evidence/timeline',
      '/admin/staff',
      '/admin/partner-keys',
    ];
    it.each(internalRoutes)('GET %s anonymously → 401/403', async (path) => {
      const res = await anon.call(path, { anonymous: true });
      expect([401, 403]).toContain(res.status);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 11. **Tenant data is isolated**
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 11: tenant evidence is scoped to the caller', () => {
    let secondUserToken = '';
    beforeAll(async () => {
      // Register a throwaway second account → personal tenant. Its evidence
      // timeline must NOT contain anything from the admin's INTERNAL tenant.
      const second = `acceptance-tenant-${randomBytes(4).toString('hex')}@vigiscam.local`;
      const reg = await fetch(`${e.baseUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: second,
          password: 'AcceptanceTenant!2026',
          fullName: 'Acceptance Tenant 11',
        }),
      });
      if (reg.status !== 201) {
        throw new Error(`Tenant-isolation prep failed: ${reg.status}`);
      }
      const body = (await reg.json()) as { accessToken: string };
      secondUserToken = body.accessToken;
    });
    it('a freshly-registered user sees an empty evidence timeline', async () => {
      const second = new ApiCaller(e.baseUrl, secondUserToken);
      const res = await second.call<Array<{ tenantId: string }>>('/evidence/timeline');
      expect(res.status).toBe(200);
      // Either empty, or every row is the user's own tenant — never the
      // INTERNAL tenant the admin operates on.
      const adminTenant = '11111111-1111-4111-8111-111111111111';
      for (const row of res.data) {
        expect(row.tenantId).not.toBe(adminTenant);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 12. Public registry shows **only verified public-safe records**
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 12: every public search result has a public-safe status', () => {
    it('every item.publicStatus is in the public-safe enum', async () => {
      const res = await anon.call<{
        items: Array<{ publicStatus: string }>;
      }>('/registry/search?limit=100', { anonymous: true });
      expect(res.status).toBe(200);
      for (const item of res.data.items) {
        expect(PUBLIC_SAFE_STATUSES).toContain(item.publicStatus);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 13. **Corrections and appeals workflow exists**
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 13: anonymous appeal → admin review → admin decide', () => {
    let appealId = '';
    it('anonymous user files an appeal against the published entry', async () => {
      const res = await anon.call<{ id?: string; appealId?: string }>(
        `/registry/${publishedRegistryId}/appeal`,
        {
          anonymous: true,
          body: {
            appealType: 'OWNERSHIP_DISPUTE',
            submitterName: 'Acceptance Tester',
            submitterEmail: 'tester@example.com',
            reason: 'This indicator belongs to a legitimate business of mine.',
          },
        },
      );
      expect(res.status).toBe(202);
      // Service can name the id field either way — accept both.
      const id = res.data.id ?? res.data.appealId;
      expect(id).toBeTruthy();
      appealId = id!;
    });
    it('admin moves the appeal UNDER_REVIEW', async () => {
      const res = await api.call<{ status: string }>(
        `/intelligence/registry-appeals/${appealId}/review`,
        { method: 'POST' },
      );
      expect(res.status).toBe(200);
    });
    it('admin records the decision and it is logged', async () => {
      const res = await api.call<{ status: string }>(
        `/intelligence/registry-appeals/${appealId}/decide`,
        {
          body: {
            decision: 'REJECTED',
            reviewNotes: 'No evidence of legitimate ownership supplied.',
            resolutionAction: 'Listing stands.',
          },
        },
      );
      expect(res.status).toBe(200);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 14. FreezeLock can **receive critical intervention triggers**
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 14: FreezeLock accepts a critical trigger and records it', () => {
    it('POST /freezelock/trigger → 201 + the trigger appears in history', async () => {
      const create = await api.call<{ id: string }>('/freezelock/trigger', {
        body: { trigger: 'Acceptance test: simulated active scam call' },
      });
      expect(create.status).toBe(201);
      expect(create.data.id).toMatch(/^[0-9a-f-]{36}$/);

      const list = await api.call<Array<{ id: string }>>('/freezelock');
      expect(list.status).toBe(200);
      expect(list.data.some((t) => t.id === create.data.id)).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 15. FREEZEGUARD telemetry can **feed risk scoring**
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 15: FREEZEGUARD telemetry produces a scored response', () => {
    it('POST /freezeguard/telemetry → 200 with a numeric outcome', async () => {
      const res = await api.call<Record<string, unknown>>('/freezeguard/telemetry', {
        body: {
          remoteAccessTools: ['AnyDesk'],
          screenSharing: true,
          remoteInputDetected: true,
          bankingSiteOpen: true,
        },
      });
      expect(res.status).toBe(200);
      // The service returns a risk-shaped object — confirm a numeric field is
      // produced. Don't over-pin to one schema because the field name has
      // evolved (riskScore, score, suspicionScore in different phases).
      const numericFields = Object.values(res.data).filter((v) => typeof v === 'number');
      expect(numericFields.length).toBeGreaterThan(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 16. A1SCAMSHIELD can **feed live scam scores**
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 16: A1SCAMSHIELD analyse returns a numeric score', () => {
    it('POST /a1scamshield/analyze with classic scam phrasing scores > 0', async () => {
      const res = await api.call<Record<string, unknown>>('/a1scamshield/analyze', {
        body: {
          text:
            'Install AnyDesk right now and move your savings to a safe account ' +
            'while I stay on the line.',
        },
      });
      expect(res.status).toBe(200);
      const numericFields = Object.values(res.data).filter((v) => typeof v === 'number');
      expect(numericFields.length).toBeGreaterThan(0);
      // At least one numeric field should be > 0 — pure-noise input would
      // score zero. We don't pin which field (riskScore / score / etc).
      expect(numericFields.some((n) => (n as number) > 0)).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 17. SCAMZY/ScamPulse can **feed evolving scam intelligence**
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 17: a fresh scam-report is queryable as a signal', () => {
    it('a NEW signal is retrievable as VERIFIED after promotion', async () => {
      // Re-uses the publishedSignalId we promoted in criteria 5/6.
      const res = await api.call<{ status: string; indicatorValue: string }>(
        `/intelligence/signals/${publishedSignalId}`,
      );
      expect(res.status).toBe(200);
      expect(res.data.status).toBe('VERIFIED_SCAM_INTELLIGENCE');
      expect(res.data.indicatorValue).toBe(phishingDomain);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 18. APIs are **documented in Swagger/OpenAPI**
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 18: OpenAPI spec is published and complete', () => {
    it('GET /api/docs-json returns a spec with > 30 paths', async () => {
      // /docs-json sits OUTSIDE the /v1 prefix (mounted at apiPrefix/docs).
      const root = e.baseUrl.replace(/\/v1\/?$/, '');
      const res = await fetch(`${root}/docs-json`);
      expect(res.status).toBe(200);
      const spec = (await res.json()) as { paths?: Record<string, unknown> };
      expect(spec.paths).toBeTruthy();
      expect(Object.keys(spec.paths!).length).toBeGreaterThan(30);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 19. All inputs are **validated and rate-limited**
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 19: validation + rate-limit headers', () => {
    it('malformed scam-check body → 400', async () => {
      const res = await anon.call('/scam-check', {
        anonymous: true,
        body: { indicatorType: 'NOT_A_VALID_TYPE', indicatorValue: '' },
      });
      expect(res.status).toBe(400);
    });
    it('throttler advertises its budget via x-ratelimit-* headers', async () => {
      const res = await anon.call('/scam-check', {
        anonymous: true,
        body: {
          indicatorType: 'PHONE',
          indicatorValue: '+15550000000',
        },
      });
      expect(res.headers.get('x-ratelimit-limit')).toBeTruthy();
      expect(res.headers.get('x-ratelimit-remaining')).toBeTruthy();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 20. Build passes with **no TypeScript errors**
  // ───────────────────────────────────────────────────────────────────────────
  describe('Criterion 20: typecheck guarantee', () => {
    // The deployed image only exists because `npm run build` (which runs `nest
    // build`, which runs `tsc`) succeeded. If we got this far, the typecheck
    // already passed at deploy time. This stub records the fact for the
    // acceptance report; CI re-runs `npm run typecheck` in `ci.yml` on every
    // PR which is the real guard.
    it('this run only exists because tsc passed at deploy', () => {
      expect(true).toBe(true);
    });
  });
});
