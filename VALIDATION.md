# VIGISCAM Backend — Validation & Testing Guide

This document is the entry point for validating the VIGISCAM main backend.
It covers how to build, run, and test the service locally, what each phase
delivers, and how the graceful-degradation toggles let you exercise the
whole system with **only PostgreSQL** — no external cloud services required.

- **Stack:** NestJS 11 · TypeScript (strict) · Prisma 6 · PostgreSQL
- **Tests:** 407 unit/integration (Jest) · contract suite · acceptance suite
- **Migrations:** 43 (`0001` … `0043_billing`)
- **Latest commit at packaging:** see `git log -1` (Phase 11B)

---

## 1. Prerequisites

| Requirement | Notes |
|---|---|
| Node.js 22.x | The CI/deploy pipeline uses Node 22. |
| npm | Lockfile committed; use `npm ci` for a reproducible install. |
| PostgreSQL 14+ | The only hard dependency to run the app + full test suite. |

Everything else (Redis, Azure Blob, SendGrid/Twilio/FCM, Stripe, the AI
worker tier) is **optional**. When its env var is absent the corresponding
service runs in a documented **stub / no-op mode** with a `WARN` log, so the
app boots and tests pass without standing up any external dependency.

---

## 2. Quick start

```bash
# 1. Install dependencies (reproducible)
npm ci

# 2. Configure environment
cp .env.example .env
#   Edit .env and set at minimum:
#     DATABASE_URL=postgresql://USER:PASS@localhost:5432/vigiscam
#     JWT_SECRET=<any string ≥ 16 chars>

# 3. Apply the database schema (all 43 migrations)
npx prisma migrate deploy

# 4. Generate the Prisma client (usually run by install, safe to repeat)
npx prisma generate

# 5. Run the service (watch mode)
npm run start:dev
#   → listening on http://localhost:3000, base path /api, docs at /api/docs
```

Liveness check once it's up:

```bash
curl -s http://localhost:3000/api/v1/health/live
# {"status":"ok","service":"vigiscam-backend",...}
```

---

## 3. Running the tests

```bash
# Full unit/integration suite (407 tests). Needs no external services.
npm test

# Type-check only (no emit)
npx tsc --noEmit

# Lint
npm run lint
```

Two further suites run against a **deployed** instance (they hit a live URL
and need a seeded admin account — used by the CI deploy gate, not required
for local validation):

```bash
npm run test:contract     # OpenAPI contract conformance
npm run test:acceptance   # docs/08 acceptance criteria
```

Both read `CONTRACT_API_BASE`, `CONTRACT_ADMIN_EMAIL`, `CONTRACT_ADMIN_PASSWORD`.

---

## 4. Graceful-degradation toggles

Each integration activates when its env var is present and otherwise falls
back. This is **by design** — the stub is the documented fallback, never
removed, so the platform degrades gracefully if a tier is down.

| Capability | Env var(s) | Absent → behaviour |
|---|---|---|
| Redis cache + pub/sub | `REDIS_URL` | In-process LRU cache; no cross-process invalidation |
| Azure Blob (evidence files) | `AZURE_STORAGE_ACCOUNT` or `..._CONNECTION_STRING` | Upload returns null; file row records a `blob://stub/...` URI |
| Email / SMS / Push | `SENDGRID_*` / `TWILIO_*` / `FCM_SERVER_KEY` | Channel becomes a stub that logs the would-be delivery |
| Stripe billing | `STRIPE_SECRET_KEY` (+ `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`) | Stub mode: placeholder checkout/portal URLs; webhooks parsed without signature verification |
| AI worker tier | `AI_SERVICE_URL` | Every AI engine answers from its in-process deterministic stub (`source=STUB`) |

Verify the toggles live (internal-staff token required):

```bash
# AI worker toggle state per engine (Phase 11B)
curl -s $BASE/api/v1/intelligence/ai-status -H "Authorization: Bearer $TOKEN"

# Billing subscription (Phase 11A) — any authenticated user, own tenant
curl -s $BASE/api/v1/billing/subscription -H "Authorization: Bearer $TOKEN"
#   "stripeConfigured": false  → running in stub mode (expected without keys)
```

---

## 5. Phase manifest (what's in this build)

| Phase | Scope | Status |
|---|---|---|
| 0–3 | Auth, devices, sessions, tenanting, RBAC + ABAC, JWT + refresh | ✅ |
| 1–5 | FreezeGuard/FreezeLock, scam signals, scam-check, registry + search, review queue, verification & governance, corrections/appeals, takedowns | ✅ |
| 4 | Clustering, detection rules, rule suggestions, intelligence metrics | ✅ |
| 5D | Partner APIs + keys + webhooks + evidence export bundles | ✅ |
| 6 | AI audit, NLP classifier, vector embeddings, fraud-network graph, Authenticity suite, Fraud Journey + VictimState, OSINT — all stub-fallback | ✅ |
| 7 | Registry scale + caching + ETag, campaign graph, cross-border agency feeds, takedown automation, commercial tiers, regional public alerts | ✅ |
| 8A–8E | Async infra: Redis cache + pub/sub, BullMQ queues, WebSocket gateway, Azure Blob, notification adapters | ✅ |
| 9A–9H | Protection modules: Guardian Pause, ScamHold, GiftCardGuard, WalletGuard, ClaimVerify, ScamMirror, Identity Collision Graph, Trusted-Contact Review | ✅ |
| 10A | Evidence Vault file storage (upload / share / export / public-safe, legal hold) | ✅ |
| 10B | BankGuard portal (risk queue, teller-assist scoring, case review) | ✅ |
| 10C | PlatformShield portal (moderation queue, grooming detection) | ✅ |
| 10D | Investigator console (cases ↔ evidence ↔ clusters ↔ notes) | ✅ |
| 10E | Enterprise admin (policies, device fleet, integrations, audit log, billing surface) | ✅ |
| 10F | Internal Admin cross-tenant oversight (overview, module events, tenant status) | ✅ |
| 11A | Stripe billing (subscriptions, webhooks, plan-enforcement, manual invoice) | ✅ |
| 11B | Real AI worker toggle — all engines route external when `AI_SERVICE_URL` set, else stub; `GET /ai-status` reports the toggle | ✅ |
| 11C | LR-5 legal review checkpoint | ⏳ pending |
| 11D | Acceptance gate v2 (extends the 20 criteria with the new modules) | ⏳ pending |

---

## 6. Security model (preserved invariants)

- **All backend / hosting / infra on Azure**; website on Vercel; domain on NameCheap.
- **Secrets are never committed.** Only `.env.example` (placeholder values) ships.
  Cloud secrets come from Azure Key Vault, not files.
- **Raw API keys / HMAC secrets** are shown exactly **once** at creation, then
  stored only as a SHA-256 hash + short display prefix.
- **Evidence Vault** is an append-only, hash-chained, tamper-evident log
  (per-tenant SHA-256 chains); `GET /api/v1/evidence/verify` walks the chain.
- **Tenant isolation** is enforced on every query by the JWT-resolved
  `tenantId`; the role-portal guards additionally gate by `TenantType`.

---

## 7. Useful endpoints for spot-checking

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/health/live` | Liveness (public) |
| `GET /api/v1/health/ready` | Readiness — checks DB reachability |
| `GET /api/docs` | Swagger UI (all routes + schemas) |
| `GET /api/v1/evidence/verify` | Verify the tenant's evidence chain integrity |
| `GET /api/v1/intelligence/ai-status` | AI worker toggle state (internal staff) |
| `GET /api/v1/billing/subscription` | Tenant billing state |

> Most non-public routes require a Bearer JWT from `POST /api/v1/auth/login`.
> Role-portal routes (`/bank-portal`, `/platform-portal`, `/investigator-portal`,
> `/enterprise-portal`, `/admin/oversight`) additionally require the caller's
> tenant to be of the matching `TenantType` — a `403` from a mismatched tenant
> is the **expected** signal that the guard is active.
