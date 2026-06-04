# VIGISCAM Backend — Build / Run Proof Log

Fresh local run of the seven reviewer commands on **2026-06-04**, captured to
`proof/proof-run.log` (raw transcript) by `proof/run-proof.sh`. Every command
exited **0**.

- Host: Windows · Node **v24.15.0** · Prisma **6.19.3** · Nest CLI **11.0.21**
- DB for commands 6–7: a throwaway **PostgreSQL 16** cluster on `:5433` (role
  `vigiscam`, trust auth) — the only override is the runtime `DATABASE_URL`; no
  source was changed.

| # | Command | Result | Exit |
|---|---------|--------|------|
| 1 | `npm ci` | `added 891 packages, and audited 892 packages in 36s` | **0** |
| 2 | `npx prisma generate` | `✔ Generated Prisma Client (v6.19.3)` | **0** |
| 3 | `npm run typecheck` | `tsc --noEmit` — no errors | **0** |
| 4 | `npm test` | **Test Suites: 64 passed, 64 total · Tests: 437 passed, 437 total** | **0** |
| 5 | `npm run build` | `nest build` → emits `dist/main.js` | **0** |
| 6 | `npm run prisma:deploy` | `All migrations have been successfully applied.` (47 migrations on a fresh DB) | **0** |
| 7 | `npm run start:dev` | App boots, maps **205 routes**, connects to DB, serves | **0** |

## Command 7 — `npm run start:dev` boot evidence

```
[1:10:21 PM] Found 0 errors. Watching for file changes.
INFO  Nest application successfully started            {"context":"NestApplication"}
INFO  VIGISCAM backend listening on port 3000 — base path /api, docs at /api/docs  {"context":"Bootstrap"}
```

Local runtime probes against the running dev server (`:3000`):

```
GET /api/v1/health/live  -> 200
GET /api/v1/health/ready -> 200  {"status":"ok","service":"vigiscam-backend","checks":{"database":{"status":"up"}}}
GET /api/docs            -> 200
```

`health/ready` reporting `database: up` confirms the app connected to Postgres
and ran a live query.

## Reproducing

```bash
# one throwaway DB (no docker needed; PostgreSQL 16 client+server installed):
initdb -D /tmp/vgpg -U vigiscam --auth=trust
pg_ctl  -D /tmp/vgpg -o "-p 5433" -l /tmp/vgpg/server.log start
createdb -h localhost -p 5433 -U vigiscam vigiscam
export DATABASE_URL="postgresql://vigiscam:vigiscam@localhost:5433/vigiscam?schema=public"

bash proof/run-proof.sh          # commands 1–6
npm run start:dev                # command 7 (Ctrl-C to stop)
```

### Two environment gotchas worth knowing
1. **`prisma:deploy` / `start:dev` need a reachable DB.** The committed
   `.env` points at a local `:5432`; supply a `DATABASE_URL` you control (above).
2. **Stale incremental cache can make `tsc` skip emit.** A leftover
   `*.tsbuildinfo` makes `tsc` report "Found 0 errors" but not re-emit
   `dist/main.js`, so `start:dev` then can't find the entry. `rm -rf dist
   *.tsbuildinfo` before a cold boot. (CI is unaffected — it uses a fresh
   `npm ci` checkout.)

## Canonical CI/CD proof
Both backend workflows run a superset of this on every push to `main`:
- **CI** (`.github/workflows/ci.yml`): spins up `postgres:16`, runs
  `prisma migrate deploy` → lint → typecheck → build → `npm test` → `test:e2e`.
- **Deploy** (`.github/workflows/deploy.yml`): `prisma migrate deploy` → build →
  rollout to Azure Container Apps; the live `/api/v1/health/ready` then reports
  `database: up`.

See also `BUILD-PROOF.md`, `VALIDATION.md`, and `ACCEPTANCE.md` (41-criterion gate, 69/69 live).
