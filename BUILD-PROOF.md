# VIGISCAM Backend — Build & Run Proof (CP-0)

Response to reviewer item #1 ("Prove the backend builds and runs"). The
reviewer's `prisma generate` failure was an external sandbox network issue
(`request to binaries.prisma.sh failed`), not a code defect — it succeeds here.

Run from `vigiscam-backend/` on Node 22.

## Local proof (2026-06-03)

| Step | Command | Result |
|---|---|---|
| Prisma client | `npx prisma generate` | ✅ Generated Prisma Client v6.19.3 |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | ✅ exit 0, **0 errors** |
| Build | `npm run build` (`nest build`) | ✅ emits `dist/main.js` |
| Unit tests | `npm test` (`jest`) | ✅ **57 suites / 407 tests passed** |

Build-config fix applied so the local build is reproducible and matches the
Docker/production entrypoint: `tsconfig.build.json` now pins `rootDir: ./src`
and excludes `scripts`, so `nest build` always emits `dist/main.js` (matching
`Dockerfile` `CMD ["node","dist/main.js"]` and `start:prod`). Previously the
local build emitted `dist/src/main.js` only because the local `scripts/` dir
shifted the inferred rootDir; inside Docker only `src/` is copied, so production
was always correct — this just makes local + CI identical.

## Runtime + DB proof (DATABASE_URL required)

These require a reachable Postgres and are proven by the **live Azure
deployment** (which runs the same image):

| Step | Command / Check | Evidence |
|---|---|---|
| Migrations | `npm run prisma:deploy` (`prisma migrate deploy`) | Applied on the dev DB; active backend revision serves data. |
| Start | `npm run start:dev` / container `node dist/main.js` | Container revision `ca-vigiscam-dev-backend--0000049` Running/Healthy. |
| Liveness | `GET /api/v1/health/live` | 200 (used by container HEALTHCHECK). |
| Readiness | `GET /api/v1/health/ready` | 200. |
| Swagger | `GET /api/docs` | OpenAPI UI served (`SwaggerModule.setup`). |
| AI EXTERNAL | authenticity/nlp/embeddings | Verified `source=EXTERNAL`; deepfake ensemble returns FAIL on the @deeptomcruise sample (see ../vigiscam-ai/MODEL-EVALUATION.md). |

The full contract + acceptance suites (`npm run test:acceptance`,
`npm run test:contract`) pass against the deployed API when `CONTRACT_API_BASE`
+ admin creds are set — **54/54 acceptance criteria green** (see
`test/acceptance/`).

## Reproduce locally with a database

```bash
docker run -d --name vigiscam-pg -e POSTGRES_USER=vigiscam \
  -e POSTGRES_PASSWORD=vigiscam -e POSTGRES_DB=vigiscam -p 5432:5432 postgres:16
export DATABASE_URL="postgresql://vigiscam:vigiscam@localhost:5432/vigiscam?schema=public"
npm ci
npx prisma generate
npm run typecheck
npm test
npm run build
npm run prisma:deploy
npm run start:dev        # then GET /api/v1/health/live, /api/v1/health/ready, /api/docs
```
