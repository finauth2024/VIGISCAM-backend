# VIGISCAM Backend

The VIGISCAM™ main backend — a NestJS + TypeScript API. This repository is the
**Phase 0 foundation** from the build plan in
[`../docs/`](../docs/README.md) (see
[`02-WORK-PATHWAY-AND-PHASES.md`](../docs/02-WORK-PATHWAY-AND-PHASES.md)).

> **Detect the Scam. Stop the Harm. Expose the Network.**

## Stack

NestJS · TypeScript (strict) · PostgreSQL + Prisma · Redis (Phase 1+) ·
pino structured logging · OpenAPI/Swagger · Docker · Azure (Container Apps).

## What Phase 0 ships

- NestJS application scaffold with a typed, **validated** configuration layer.
- Cross-cutting foundation: structured logging (secrets redacted), a global
  error envelope, global input validation, baseline rate limiting, security
  headers, URI API versioning.
- Prisma wired to PostgreSQL with the initial `audit_logs` migration.
- `health` module — liveness & readiness probes.
- Swagger API docs.
- Multi-stage `Dockerfile`; GitHub Actions CI (lint, type-check, build, test,
  security scan, image build) and a manual Azure deploy workflow.
- Azure infrastructure-as-code (`infra/main.bicep`).

## Prerequisites

- Node.js 22+ and npm.
- A PostgreSQL database (local Docker, or the Azure instance from `infra/`).

## Getting started

```bash
cp .env.example .env          # then edit DATABASE_URL etc.
npm install                   # also generates the Prisma client
npm run prisma:migrate        # applies migrations to your database
npm run start:dev             # http://localhost:3000
```

- API base path: `/api/v1`
- Swagger UI: `/api/docs`
- Health: `/api/v1/health/live` · `/api/v1/health/ready`

## Scripts

| Command | Purpose |
|---|---|
| `npm run start:dev` | Run with hot reload |
| `npm run build` | Compile to `dist/` |
| `npm run typecheck` | Type-check only (no emit) |
| `npm run lint` | ESLint (with `--fix`) |
| `npm test` / `npm run test:e2e` | Unit / end-to-end tests |
| `npm run prisma:migrate` | Create & apply a migration (dev) |
| `npm run prisma:deploy` | Apply migrations (CI / production) |

## Layout

```
src/
  main.ts                  app bootstrap
  app.module.ts            root module
  common/                  cross-cutting foundation
    config/                typed config + env validation
    filters/               global exception filter
    prisma/                Prisma module & service
  modules/                 domain modules (see modules/README.md)
    health/
prisma/                    schema + migrations
infra/                     Azure Bicep IaC
.github/workflows/         CI + deploy pipelines
```

## Configuration

All settings come from environment variables ([`.env.example`](.env.example)).
The app **validates the environment at boot** and refuses to start if it is
invalid. In Azure, values are sourced from Key Vault — never from committed files.

## Security & guardrails

This codebase follows [`docs/05-GUARDRAILS-HARDENING.md`](../docs/05-GUARDRAILS-HARDENING.md):
validated inputs, redacted logs, rate limiting, security headers, no secrets in
source, a consistent non-leaking error envelope. The same standard applies to
every module added in later phases.
