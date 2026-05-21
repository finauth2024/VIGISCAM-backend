# Domain Modules

Each VIGISCAM backend domain is a NestJS module under `src/modules/`. Phase 0
ships only the `health` module; the rest are added phase by phase per
[`docs/02-WORK-PATHWAY-AND-PHASES.md`](../../../docs/02-WORK-PATHWAY-AND-PHASES.md).

Modules are kept thin and dependency-injected, and depend on **service
interfaces** rather than concrete implementations — so an in-process module can
later become its own deployable service without callers changing.

## Planned module map (from the brief, PDF §44)

| Module | Phase | Purpose |
|---|---|---|
| `health` | **0 (done)** | Liveness / readiness probes |
| `auth` | 1 | Signup, login, MFA, JWT + refresh, sessions |
| `users` | 1 | User accounts & profiles |
| `tenants` | 1 | Multi-tenant isolation, tenant types |
| `roles` | 1 | RBAC + ABAC |
| `families` | 1 | Family, guardian & consent |
| `devices` | 1 | Device enrollment & trust |
| `sessions` | 1 | Live / video / remote / browser sessions |
| `alerts` | 1 | Alert & notification orchestration |
| `evidence-vault` | 1 | Tamper-evident, hash-chained evidence |
| `risk-fusion` | 1 | Unified Scam Threat Score |
| `freezeguard` | 1 | Remote-access / takeover telemetry |
| `freezelock` | 1 | Emergency intervention engine |
| `a1scamshield` | 1 / 6 | Live scam-language detection (calls AI service) |
| `guardian-pause` | 1 | Pre-loss intervention delay |
| `scamhold`, `giftcardguard`, `walletguard`, `claimverify`, `scammirror` | 1–3 | Newer protection modules |
| `trusted-contacts` | 1 | Trusted-contact review workflow |
| `identity-collision-graph` | 3 / 6 | Linked suspicious identities |
| `scamzy` (scam-pulse, scam-signals, source-reliability, classification, clustering, scam-script-genome, fraud-journey, victim-state, emotion-fingerprint, predicted-next-move, network-graph) | 2 / 4 / 6 | SCAMZY / ScamPulse intelligence |
| `scam-intelligence-registry` (public-search, report-intake, verification-queue, public-safe-review, registry-publication, takedowns, corrections-appeals) | 2 / 3 | Registry governance |
| `authenticity` (livefaceseal, voicematchseal, sceneseal, camviguard, dual-auth, video-hash) | 6 | Authenticity Verification Suite |
| `bankguard`, `platformshield`, `investigator`, `agency`, `enterprise` | 5 | Tenant / partner portals |
| `internal-admin` | 3+ | Internal VIGISCAM admin console |
| `billing` | 5+ | Subscriptions & billing |
| `compliance` | 3+ | Audit, compliance, governance |
| `webhooks` | 5 | Inbound/outbound partner webhooks |

## Conventions

- One module folder per domain: `*.module.ts`, `*.controller.ts`, `*.service.ts`,
  `dto/`, `entities/` as needed.
- Controllers are versioned: `@Controller({ path: '...', version: '1' })`.
- Every input is a validated DTO (`class-validator`); public responses use
  output DTOs so internal fields cannot leak.
- Cross-cutting concerns (config, logging, Prisma, auth/tenant context, audit)
  come from `src/common/` — never re-implemented per module.
