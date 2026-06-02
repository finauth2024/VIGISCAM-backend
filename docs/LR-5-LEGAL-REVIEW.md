# LR-5 — Legal Review Checkpoint (Phases 8–11)

> Extends the checkpoint process in `04-LEGAL-AND-PUBLIC-SAFETY.md` §9
> (LR-1 → LR-4). LR-5 is the checkpoint for the **Phase 8–11 surfaces**:
> the eight protection modules (9A–9H), Evidence Vault file storage (10A),
> the five role portals (10B–10F), Stripe billing (11A), and the AI worker
> toggle (11B).
>
> **Scope of this review:** (1) public-safety language pass over every new
> module's user-facing copy, (2) data-handling review for the new evidence
> types, (3) cross-border review for the 9G Identity Collision Graph.
>
> **Method:** every finding below is grounded in the actual code path named.
> This document is the recorded checkpoint; the code-level guardrails it
> references are the enforcement.

---

## 1. Outcome summary

| Area | Result |
|---|---|
| New **public** accusation surfaces introduced by Phases 8–11 | **None** — all new surfaces are authenticated + tenant-scoped |
| Public-safe language regressions | **None found** |
| Redaction of the Evidence public-safe view (10A) | **Verified in code** |
| PII masking on Identity Graph reads (9G) | **Verified in code** |
| Message-content storage for grooming detection (10C) | **None by design** — signal flags only |
| Data-handling notes requiring operational follow-up | **4** (see §4) — none blocking |
| Cross-border (Identity Graph) | **Reviewed** — see §5 |

**Verdict:** LR-5 **passes** for backend sign-off. The four data-handling
notes in §4 are operational/DPA items for the deployment owner, not code
defects, and none gate the backend.

---

## 2. Public-safety language pass (non-negotiable #7/#8)

The 10 public-safety non-negotiables constrain **public** surfaces. The
key finding: **Phases 8–11 add no new public surface.** Every new route is
behind `JwtAuthGuard` and tenant-scoped, and the role-portal routes add a
`TenantType` guard on top.

Where the new modules emit human-readable status text, it stays inside the
approved *status-based* register and never makes an unqualified accusation
of a named third party:

| Module | User-facing vocabulary | Assessment |
|---|---|---|
| Guardian Pause / ScamHold / GiftCardGuard / WalletGuard / ClaimVerify (9A–9E) | Risk levels (`LOW…CRITICAL`), user decisions (`AVOIDED`, `BLOCKED`, `CONTINUED_ANYWAY`), trigger types | Speaks to the **protected user about their own action** — not an accusation of a third party. ✅ |
| ScamMirror (9F) | All UI marked **protected simulation**; sanitizer rejects real credentials | No real-world claim made. ✅ |
| Identity Graph (9G) | Masked display values only (§5) | No raw PII surfaced. ✅ |
| Trusted-Contact Review (9H) | Public-safe `triggerSummary` (status-based, not raw event metadata) | By construction the contact sees a status description, never the underlying evidence. ✅ |
| BankGuard (10B) | `recommendedAction` (`PROCEED`…`REFUSE_AND_ESCALATE_TO_FRAUD`) | Internal teller decision-support within the bank's own tenant. ✅ |
| PlatformShield (10C) | Moderation decisions (`REMOVE_CONTENT`, `SUSPEND_USER`, `ESCALATE_TO_LAW_ENFORCEMENT`) | A platform moderating **its own users** in its own tenant — standard T&S, not a public VIGISCAM accusation. ✅ |
| Investigator (10D) / Enterprise (10E) / Internal (10F) | Case dispositions, policy keys, tenant status | Internal staff/agency surfaces, audited. ✅ |

No machine-generated text is auto-published to any public surface in these
phases. The public registry / public-alerts path (the only public
accusation channel) is unchanged from LR-1/LR-2 and still requires reviewer
approval + reviewer-authored public-safe summary text.

---

## 3. Redaction & masking — verified in code

### 3.1 Evidence Vault public-safe view (10A)

`EvidenceFileService.publicSafeView()` returns **only** `id`, `filename`,
`mimeType`, `sizeBytes`, `uploadedAt` per file. It deliberately omits
`blobUri`, `sha256`, and any signed URL — confirmed by the
`publicSafeView` unit test asserting the serialized output contains no
secret value. Signed URLs are minted only by `share` / `exportBundle`,
which are authenticated, tenant-scoped, time-bounded, and each append a
`EVIDENCE_FILE_SHARED` / `EVIDENCE_BUNDLE_EXPORTED` chain-of-custody event.

### 3.2 Identity Collision Graph masking (9G)

`identity-graph/masker.ts` enforces: `PROFILE`, `FACE_SIGNAL`,
`VOICE_SIGNAL` never return a raw value (handle stub / first-8-of-hash);
indicators are masked by shape (email `n***@host`, phone keeps country
code + last 4, wallet keeps first-6 + last-6). The `/identity-graph/*`
read surface returns masked display values only — the raw values the
matcher needs never cross the API boundary.

### 3.3 Grooming detection holds no message content (10C)

`grooming.scorer.ts` operates on **signal flags only** (age-gap signal,
love-bombing detected, payment-request detected, `minorSuspected`, …).
No conversation text is accepted or stored — the `grooming_check_scores`
table has no message-body column. This is a deliberate data-handling
decision: conversation content involving a suspected minor is a category
of data VIGISCAM never holds. The hard-stop rule
(`minorSuspected` + escalation flag → `ESCALATE_TO_LAW_ENFORCEMENT`) is a
child-safety guardrail that no score combination can override.

---

## 4. Data-handling notes (new evidence types)

These are operational / Data-Processing-Agreement items for the deployment
owner. None is a code defect; the backend already provides the isolation,
audit, and masking controls that make compliant operation possible.

1. **Evidence file `filename` may contain PII.** A user-supplied filename
   (e.g. `john-doe-bank-statement.pdf`) is stored verbatim and appears in
   the public-safe view. *Operational guidance:* treat filenames as
   potentially-personal data; the public-safe view is "safe of vault
   internals (URIs/hashes)", not guaranteed free of user-chosen text.
   Consider a filename-sanitization policy at the UI layer.

2. **Free-text reference fields** — `teller_assist_scores.customerReference`
   and `grooming_check_scores.subjectReference` are bank/platform-internal
   references (masked account id, masked conversation id). The DTOs document
   that they must not carry raw PII or message content; enforcement is the
   integrating partner's responsibility under their DPA.

3. **Billing shares a tenant-admin email with Stripe** (a sub-processor) on
   `ensureCustomer`. Standard processor relationship; ensure Stripe is named
   in the sub-processor list. No card data ever touches VIGISCAM — Checkout
   and the Billing Portal are hosted by Stripe.

4. **Retention vs legal hold (10A).** `retentionUntil` is advisory until the
   Phase 11C+ cleanup worker enforces it; `legalHold=true` already blocks
   the future purge path. Legal-hold evidence is correctly exempt from
   user-initiated deletion (04-LEGAL §6).

---

## 5. Cross-border review — Identity Collision Graph (9G)

LR-4 covered cross-border **agency feeds** (Phase 7). LR-5 extends the
cross-border review to the **Identity Collision Graph**, which can correlate
signals (profiles, face/voice signatures, payment requests) that originate
in different jurisdictions.

- **Data minimization at the boundary.** The graph stores raw values for
  matching but the API returns only masked values (§3.2). A cross-border
  investigator never receives raw PII through the API.
- **Tenant isolation.** Graph reads are tenant-scoped; cross-tenant
  correlation is surfaced as masked cluster membership, not raw cross-tenant
  PII (04-LEGAL §4 "purpose limitation & separation").
- **Biometric-adjacent signals** (`FACE_SIGNAL`, `VOICE_SIGNAL`) are stored
  as opaque hashes, never raw biometrics, and are in the masker's
  never-reveal set. They fall under the "restricted evidence classes"
  stricter-ABAC requirement (04-LEGAL §6).
- **Residency.** Azure region selection per residency obligation is an infra
  control (Bicep / Container App region = `westus3` for dev). Production
  residency placement for biometric-adjacent data is a deployment decision
  the owner records per operating region.

**Cross-border finding:** no raw cross-border PII or biometric value is
exposed through the 9G API. Residency placement for production is the one
deployment-owner action item (carried from 04-LEGAL §4).

---

## 6. Updated checkpoint register

| Checkpoint | Before | What was reviewed | Status |
|---|---|---|---|
| LR-1 | Phase 2 public endpoints | Public-safe language, no-PII-leak, raw-report separation | ✅ |
| LR-2 | Phase 3 sign-off (hard gate) | All 10 non-negotiables, corrections/appeals, defamation posture | ✅ |
| LR-3 | Phase 5 partner onboarding | Data-sharing agreements, sector compliance, tenant isolation | ✅ |
| LR-4 | Phase 7 cross-border feeds | Data residency, cross-border transfer mechanisms | ✅ |
| **LR-5** | **Phase 8–11 surfaces** | **New-module public copy, new evidence types, Identity Graph cross-border** | **✅ (this doc)** |

---

## 7. Sign-off

LR-5 is recorded as **passed for backend sign-off**. The new protection
modules, role portals, evidence file storage, billing, and AI toggle
introduce no new public accusation surface; redaction, masking, and
data-minimization guardrails are enforced in code and verified by tests.
The four §4 notes and the §5 residency item are operational/DPA actions for
the deployment owner and do not gate the backend.

The Phase 11D acceptance gate (v2) extends — does not replace — the docs/08
criteria, and will add an automated assertion per new module.
