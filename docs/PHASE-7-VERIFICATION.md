# Phase 7 — Verification on Azure dev

Captured 2026-05-27 against deploy `63063bd` running on Azure Container Apps
(`ca-vigiscam-dev-backend` / resource group `rg-vigiscam-dev`,
FQDN `ca-vigiscam-dev-backend.lemonwater-a8a5ddd4.westus3.azurecontainerapps.io`).
Phase 7 covers the global-intelligence surface introduced in steps 7A–7F plus
the LR-4 cross-border legal checkpoint.

---

## 1. Scope verified

| Sub-step | Surface | Verification | Result |
|---|---|---|---|
| **7A** | Registry pagination + ETag + cache | `/registry/search` with `If-None-Match` round-trip | ✅ ETag emitted, `Cache-Control: public, max-age=60`, 304 on resend |
| **7B** | Campaign-level graph nodes & edges | `/intelligence/graph/nodes?indicatorType=DOMAIN` after a publish | ✅ Indicator node materialized with `riskScore: 43`, `signalCount: 2` |
| **7C** | Cross-border agency feeds | (covered by 5D + 7C unit tests; not re-exercised in this smoke) | ✅ in CI |
| **7D** | Advanced takedown automation | `/intelligence/takedowns` after a publish with a `GoDaddy` OSINT enrichment | ✅ Auto-drafted `{providerName: "GoDaddy", status: "DRAFT"}` row created |
| **7E** | Commercial intelligence APIs (tiered plans) | `POST /admin/partner-keys` with `plan: "FREE"` on the INTERNAL tenant | ✅ `vsk_…` raw key issued exactly once; plan tier persisted |
| **7F** | Regional public alert systems | `POST /admin/public-alerts/:id/status` → public `GET /public-alerts?region=US` | ✅ Publish → 200 with array → 304 on ETag resend |
| **LR-4** | Cross-border legal review checkpoint | Safe-language guard reused for alert title/body | ✅ Rejects identity-accusation strings (covered by unit tests) |

---

## 2. Bugs found and fixed during verification

Two real bugs were caught by the live smoke. Both are now on `main`.

### 2.1 PCRE inline `(?i)` flag killed every auto-takedown (commit `06d24d9`)

**Symptom.** After publishing a DOMAIN registry entry whose OSINT enrichment
named `GoDaddy.com, LLC` as the registrar, no takedown was auto-drafted.

**Cause.** Seeded provider templates (migration `0026`) used the PCRE inline
flag `(?i)godaddy`. JavaScript's `RegExp` constructor does **not** accept that
syntax — every match attempt threw `SyntaxError`, which the matcher caught and
silently treated as a non-match.

**Fix.** Strip the leading `(?i)` and always run with the JS `i` flag, keeping
existing seed data working without a data migration:

```ts
private matches(pattern: string, value: string): boolean {
  try {
    const cleaned = pattern.replace(/^\(\?i\)/, '');
    return new RegExp(cleaned, 'i').test(value);
  } catch (err) {
    this.logger.warn(`Invalid template regex "${pattern}": ${String(err)}`);
    return false;
  }
}
```

File: `src/modules/takedown/takedown-automation.service.ts`.

### 2.2 Public alerts route collision returned 401 (commit `63063bd`)

**Symptom.** Anonymous `GET /alerts?region=US` returned 401 instead of the
expected JSON array.

**Cause.** Phase 1D `AlertsController` already owns `/alerts` (JWT-protected).
The new 7F public controller mounted at the same path; the JWT-protected
controller matched first, rejecting unauthenticated traffic.

**Fix.** Renamed the public path to `/public-alerts`. The admin path
(`/admin/public-alerts`) was already distinct and unchanged.

File: `src/modules/public-alerts/public-alert-public.controller.ts` — class
decorator `@Controller({ path: 'public-alerts', version: '1' })`.

---

## 3. Bootstrap notes for fresh dev DBs

The smoke exposed two onboarding gaps that are real but not Phase 7 bugs.
They are documented here so the next operator does not lose time on them.

1. **No SUPER_ADMIN is seeded.** Migration `0010` creates the INTERNAL tenant
   but no admin user. Use the one-shot bootstrap (idempotent — safe to re-run):
   ```bash
   export CONTRACT_API_BASE="https://…/api/v1"
   export CONTRACT_ADMIN_EMAIL="contract-tests@vigiscam.local"
   export CONTRACT_ADMIN_PASSWORD="<≥10 chars>"
   export DATABASE_URL="postgresql://…"
   npm run contract:bootstrap-admin
   ```
   This registers the account via `/auth/register` and promotes it to
   SUPER_ADMIN on the INTERNAL tenant via Prisma — no manual SQL required.

2. **Partner keys reject `PERSONAL` tenants.** Auto-created personal tenants
   from `/auth/register` are type `PERSONAL`. Partner keys may only be issued
   to BANK / PLATFORM / INVESTIGATOR / AGENCY / ENTERPRISE / INTERNAL. Use the
   seeded INTERNAL tenant id `11111111-1111-4111-8111-111111111111` for any
   internal smoke key.

---

## 4. End-to-end smoke (reproducible)

The Phase 7 smoke we ran can be replayed against any dev environment by
re-running the contract test suite (see
[`test/contract/phase7-smoke.spec.ts`](../test/contract/phase7-smoke.spec.ts),
added in task #58). Until that lands, the equivalent curl sequence is:

1. Login as SUPER_ADMIN → `ADMIN_TOKEN`.
2. `POST /scam-reports` → capture `.signalId`.
3. `POST /intelligence/signals/:id/review` `{decision:"PROMOTE_TO_VERIFIED"}`.
4. Seed an `osint_enrichments` row with `data.registrar = "GoDaddy.com, LLC"`.
5. `POST /intelligence/registry/candidates` `{publicStatus:"VERIFIED_MALICIOUS", publicSafeSummary:"…"}`.
6. `POST /intelligence/registry/:id/approve` → `APPROVED_PUBLIC_SAFE`.
7. `POST /intelligence/registry/:id/publish` → `PUBLISHED`.
8. Verify 7B node via `GET /intelligence/graph/nodes?indicatorType=DOMAIN`.
9. Verify 7D auto-takedown via `GET /intelligence/takedowns`.
10. `POST /admin/partner-keys` against the INTERNAL tenant — verify `plan` + `rawKey` shape.
11. `POST /admin/public-alerts` then `POST /admin/public-alerts/:id/status {status:"PUBLISHED"}`.
12. Public `GET /public-alerts?region=US` — expect 200 + ETag + 304 on resend.

All twelve steps pass on `63063bd`. Phase 7 + LR-4 are signed off for the
Azure dev environment.
