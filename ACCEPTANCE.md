# VIGISCAM — Final Acceptance (CP-14)

Brief §26 (pp.88–89) acceptance checklist + external reviewer point #14, cross-
verified against the **deployed** backend. This is the sign-off gate for the
Review-Driven Completion Plan (CP-0 … CP-13).

## How to run

The acceptance suite is a **post-deploy contract gate** — it runs against a live
backend, not a local DB. It auto-skips when unconfigured (so `npm test` stays
green locally).

```bash
CONTRACT_API_BASE="https://<backend-fqdn>/api/v1" \
CONTRACT_ADMIN_EMAIL="contract-tests@vigiscam.local" \
CONTRACT_ADMIN_PASSWORD="********" \
npm run test:acceptance
```

Specs (`test/acceptance/*.acceptance-spec.ts`):
- `all-criteria` — criteria 1–20 (brief §26 core gate)
- `v2-modules` — criteria 21–33 (protection modules, portals, billing, AI status)
- `cp-additions` — criteria 34–41 (CP-1 … CP-13 review-completion additions)

## Last run (2026-06-03, against the deployed dev backend)

```
Test Suites: 3 passed, 3 total
Tests:       69 passed, 69 total
```

`ca-vigiscam-dev-backend…westus3.azurecontainerapps.io` — **69/69 green.**

## Brief §26 / reviewer #14 checklist → evidence

| Acceptance requirement | Proven by | Status |
|---|---|---|
| Public can search the registry without login | Criterion 1 | ✅ |
| Anonymous scam-check returns a risk score + next steps | Criterion 2 | ✅ |
| Raw reports are acknowledged as UNVERIFIED, **never auto-public** | Criteria 3, 4, 12 | ✅ |
| ScamPulse intake → review → candidate → approve → publish | Criteria 5, 6 | ✅ |
| Every major action lands a **hash-chained** Evidence row; chain verifies | Criterion 7 | ✅ |
| Rule suggestions land as DRAFT only (never auto-activate) | Criterion 8 | ✅ |
| Intelligence dashboard metrics reachable | Criterion 9 | ✅ |
| Anonymous callers rejected on every internal route | Criterion 10 | ✅ |
| **Tenant isolation** — evidence scoped to the caller | Criterion 11 | ✅ |
| Every public result carries a public-safe status | Criterion 12 | ✅ |
| Appeal → admin review → admin decide (audited) | Criterion 13 | ✅ |
| FreezeLock / FREEZEGUARD / A1SCAMSHIELD scored responses | Criteria 14–16 | ✅ |
| Fresh report queryable as a signal after promotion | Criterion 17 | ✅ |
| OpenAPI spec published + complete | Criterion 18 | ✅ |
| Validation (400) + rate-limit headers | Criterion 19 | ✅ |
| Build green (this run only exists because tsc passed) | Criterion 20 | ✅ |
| **All protection modules live + tenant-scoped** (Guardian Pause, ScamHold, GiftCardGuard, WalletGuard, ClaimVerify, ScamMirror) | Criteria 21–26 | ✅ |
| Identity Graph search returns **masked** results | Criterion 27 | ✅ |
| Trusted-contact review queue live | Criterion 28 | ✅ |
| Evidence file surface live + **redacted** public-safe view | Criterion 29 | ✅ |
| **All portals** reject a non-matching tenant | Criterion 30 | ✅ |
| Internal oversight overview reachable | Criterion 31 | ✅ |
| Billing subscription surface live | Criterion 32 | ✅ |
| AI worker toggle/status reachable (source=EXTERNAL capable) | Criterion 33 | ✅ |

## Review-completion additions (CP-1 … CP-13) → evidence

| CP | Feature | Criterion | Status |
|---|---|---|---|
| CP-1 | Protection Settings + Elder Mode toggles; auth-gated | 34 | ✅ |
| CP-3 | Unified **RiskEvent** master surface | 40 | ✅ |
| CP-6 | OSINT provider catalog — privacy-safe (no secrets) | 35 | ✅ |
| CP-7 | Model registry + AI reviewer feedback loop | 36 | ✅ |
| CP-8 | Billing **audit** trail (`/billing/events`) | 37 | ✅ |
| CP-9/10 | Queue admin metrics + worker health | 38 | ✅ |
| CP-11 | Evidence export-bundle routes mounted + access-controlled | 39 | ✅ |
| CP-13 | Consumer Identity Collision search — masked + validated + auth-gated | 41 | ✅ |

CP-2 (trusted-contact **enforcement**), CP-4 (authenticity media), CP-5
(ClaimVerify→ScamSignals) and CP-12 (Identity Graph node ingestion) are exercised
indirectly: CP-2 via the held-action release path behind criteria 21–26 + 28;
CP-4/CP-5/CP-12 via the signal→graph pipeline behind criteria 5/6/17/27. Their
unit/integration coverage lives in the module specs (`npm test`).

## Companion proofs
- `BUILD-PROOF.md` — clean build (dist/main.js), typecheck 0 errors, unit suite.
- `VALIDATION.md` — health, docs, AI-source=EXTERNAL recording.
- `AI-GOVERNANCE.md`, `BILLING-PRODUCTION.md`, `QUEUES.md` — per-domain detail.

## Sign-off
With criteria 1–41 green against the deployed backend, the backend satisfies the
brief §26 acceptance gate **and** the external reviewer's 14-point completion
list. Ready for acceptance review.
