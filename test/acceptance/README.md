# Acceptance tests — docs/08 sign-off gate

These specs prove the acceptance criteria from `docs/08-ACCEPTANCE-CRITERIA.md`
end-to-end against a deployed environment. The backend is declared
"ready for frontend integration" only when they all pass.

- **v1 — `all-criteria.acceptance-spec.ts`** — the original **20 criteria**
  (public surface, role gating, tenant isolation, evidence chain, dashboards,
  appeals, FreezeLock, FREEZEGUARD, A1SCAMSHIELD, OpenAPI, validation, rate
  limiting).
- **v2 — `v2-modules.acceptance-spec.ts`** (Phase 11D) — **criteria 21–33**,
  one per Phase 9–11 surface: the eight protection modules, Evidence Vault
  file storage, the five role portals, internal oversight, Stripe billing,
  and the AI worker toggle. The v2 gate **extends** — it does not replace —
  the original 20.

Both files match the `*.acceptance-spec.ts` regex, so `npm run test:acceptance`
runs them together.

## Relationship to the other test layers

| Layer | What it proves | Where |
|---|---|---|
| Unit (`*.spec.ts` in `src/`) | Domain logic, pure functions, scoring | CI, every PR |
| E2E (`test/*.e2e-spec.ts`) | Modules wired correctly against a test Postgres | CI, every PR |
| Contract (`test/contract/`) | Phase 7 surface — deployed binary serves the typed contract | Post-deploy |
| **Acceptance** (`test/acceptance/`) | **The 20 docs/08 criteria — the brief's definition of "ready"** | Post-deploy |

The contract suite is narrower (Phase 7 smoke). The acceptance suite is broader:
public surface, role gating, tenant isolation, evidence chain, dashboards,
appeals, FreezeLock, FREEZEGUARD, A1SCAMSHIELD, OpenAPI, validation, rate
limiting — every cross-cutting guarantee the brief calls non-negotiable.

## Running locally

Same env vars as the contract suite — no extra configuration needed:

```powershell
cd "C:\VIGISCAM WORKSPACE\vigiscam-backend"

$env:CONTRACT_API_BASE       = "https://…/api/v1"
$env:CONTRACT_ADMIN_EMAIL    = "contract-tests@vigiscam.local"
$env:CONTRACT_ADMIN_PASSWORD = "…"
$env:DATABASE_URL            = "postgresql://…"

# First-time only: registers + promotes the admin
npm run contract:bootstrap-admin

# Run the suite
npm run test:acceptance
```

## CI

`.github/workflows/deploy.yml` runs the suite after the contract suite. Same
secrets — no new GitHub secrets required. A failure here means the deploy is
**not** "ready for frontend integration" even if the contract suite passed.

## What each criterion proves

Criteria 1–20 → `describe('Criterion N: …')` blocks in
`all-criteria.acceptance-spec.ts`; criteria 21–33 → blocks in
`v2-modules.acceptance-spec.ts`. The describe titles mirror the criteria
tables so a CI failure points directly at the row.

### v2 criteria (21–33)

| # | Surface | Assertion |
|---|---|---|
| 21 | Guardian Pause (9A) | `/guardian-pause/history` → 200 + array |
| 22 | ScamHold (9B) | `/scamhold/check` scores a crypto transfer; history reachable |
| 23 | GiftCardGuard (9C) | code-reveal + impersonation scan → HIGH/CRITICAL |
| 24 | WalletGuard (9D) | malformed address → CRITICAL + invalid |
| 25 | ClaimVerify (9E) | `/claimverify/history` → 200 + array |
| 26 | ScamMirror (9F) | `/scammirror/history` → 200 + array |
| 27 | Identity Graph (9G) | `/identity-graph/search` → 200 (masked results) |
| 28 | Trusted-contact review (9H) | `/trusted-contacts/reviews` → 200 + array |
| 29 | Evidence files (10A) | public-safe view omits blobUri/sha256; bogus share → 404 |
| 30 | Role portals (10B–10E) | each portal returns 403 to a non-matching tenant |
| 31 | Internal oversight (10F) | `/admin/oversight/overview` → 200 with counts |
| 32 | Billing (11A) | `/billing/subscription` → 200 with plan + status |
| 33 | AI toggle (11B) | `/intelligence/ai-status` → 200 with engines + toggle |

> The admin is an INTERNAL SUPER_ADMIN, so the protection modules and the
> internal/billing/AI surfaces are exercised on the happy path, while the
> role portals are asserted **tenant-gated** (a 403 proves the guard is
> mounted; a real BANK/PLATFORM/INVESTIGATOR/ENTERPRISE tenant gets data).
