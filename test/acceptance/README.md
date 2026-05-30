# Acceptance tests — docs/08 sign-off gate

These specs prove the **20 acceptance criteria** from `docs/08-ACCEPTANCE-CRITERIA.md`
end-to-end against a deployed environment. The backend is declared
"ready for frontend integration" only when **all 20** pass.

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

Map of criterion → `describe('Criterion N: …')` block in
`all-criteria.acceptance-spec.ts`. The describe titles mirror docs/08 exactly
so a CI failure points directly at the row in the criteria table.
