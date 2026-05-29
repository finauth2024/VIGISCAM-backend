# Contract tests

These specs hit a **deployed** environment over HTTP. They replace the ad-hoc
Phase 7 curl smoke and run as a post-deploy CI job.

## How they're different from `test/*.e2e-spec.ts`

- E2E tests boot the Nest app in-process against a test Postgres.
- Contract tests run against a **live URL** — they prove the actual deployed
  binary serves the expected contract, the URL is reachable, the JWT issuer is
  configured, the DB migrations ran, etc.

If the contract suite fails after a deploy, the rollout is broken even if
every E2E test passed locally.

## Running locally (3 env vars max)

```bash
# 1. Required — points at the deployed API including the /api/v1 prefix
export CONTRACT_API_BASE="https://ca-vigiscam-dev-backend.<suffix>.westus3.azurecontainerapps.io/api/v1"

# 2. Required — a SUPER_ADMIN that exists on that environment.
#    Use scripts/bootstrap-contract-admin.ts to create one in one shot.
export CONTRACT_ADMIN_EMAIL="contract-tests@vigiscam.local"
export CONTRACT_ADMIN_PASSWORD="…"

# 3. Optional — enables the 7D auto-takedown assertion (seeds OSINT via Prisma)
export DATABASE_URL="postgresql://dbmaster:…@psql-vigiscam-dev-….postgres.database.azure.com:5432/vigiscam?sslmode=require"

npm run test:contract
```

That's it — no `psql` binary required.

## First-time bootstrap on a fresh DB

Migrations create the INTERNAL tenant but no SUPER_ADMIN. Use the bootstrap
script — it registers the contract-test admin and promotes them in one shot:

```bash
export CONTRACT_API_BASE="https://…/api/v1"
export CONTRACT_ADMIN_EMAIL="contract-tests@vigiscam.local"
export CONTRACT_ADMIN_PASSWORD="<≥10 chars>"
export DATABASE_URL="postgresql://…"

npm run contract:bootstrap-admin
```

Idempotent — safe to re-run; if the user already exists it just promotes them.

## CI

`.github/workflows/deploy.yml` runs this suite after every deploy. Required
GitHub secrets:

| Secret | Purpose |
|---|---|
| `CONTRACT_ADMIN_EMAIL` | SUPER_ADMIN account email |
| `CONTRACT_ADMIN_PASSWORD` | Its password |
| `DATABASE_URL` | **Already configured** for migrations — reused |

Nothing else needs to be added on a per-deploy basis.

## What the suite proves

Each `describe()` block maps to one Phase 7 sub-step. Anything green here is
the same end-to-end smoke we ran by hand during Phase 7 verification — now
typed, repeatable, and CI-gated.
