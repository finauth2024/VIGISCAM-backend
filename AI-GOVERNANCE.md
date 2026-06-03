# VIGISCAM AI Governance (CP-7)

Response to reviewer item #7 ("AI worker exists, but production AI is still
early… add or plan model registry, reviewer feedback loop, active learning, eval
metrics; every AI decision must store model/version/source/…/review status").

## What's built now (backend)

### 1. Per-decision audit envelope (non-negotiable #13)
Every AI call writes an `ai_decisions` row. Each decision stores: `serviceKind`,
`modelVersion`, `source` (STUB/EXTERNAL), input digest + snippet, `output`
(reason codes + risk score + confidence live in the worker decision envelope),
`confidence`, `durationMs`, `createdAt`, **and now (CP-7)**
`requiresHumanReview`, `reviewStatus`, `reviewerLabel`, `reviewedByUserId`,
`reviewedAt`, `reviewNotes`, `modelRegistryId`.

### 2. Model version registry — `model_registry`
`GET/POST /api/v1/intelligence/models`, `PATCH /…/models/:id/status`.
Every model is registered with `serviceKind`, `modelName`, `version`, `status`
(DRAFT → SHADOW → ACTIVE → RETIRED), `source`, and free-form `metrics`
(accuracy, false-negative rate, …). Promoting a version to ACTIVE retires the
prior ACTIVE version, so there is exactly one canonical model per service.

### 3. Reviewer feedback loop — `model_feedback`
- `GET /api/v1/intelligence/ai-decisions/review-queue` — decisions flagged
  `requiresHumanReview` or below the confidence threshold, still PENDING.
- `POST /api/v1/intelligence/ai-decisions/:id/feedback` — a reviewer records a
  verdict (`CONFIRMED_CORRECT`, `FALSE_POSITIVE`, `FALSE_NEGATIVE`,
  `CORRECTED_CATEGORY`, `INCONCLUSIVE_ACCEPTED`) + optional `correctedOutput`.
  This updates the decision's `reviewStatus` and writes a `model_feedback` row —
  the **labelled dataset that drives active learning / retraining**.
- `GET /api/v1/intelligence/ai-decisions/feedback-stats` — per-model eval
  metrics rolled up from feedback (false-positive / false-negative rates).

## The separate AI services (plan)

The brief (§5/§17/§18) calls for these as separate internal services. They are
exposed today by the Python AI worker (`vigiscam-ai`, FastAPI) behind
`AI_SERVICE_URL`; the backend records every call as an `ai_decisions` row with
`source=EXTERNAL`. Maturity + path:

| Service | serviceKind | Today | Production path |
|---|---|---|---|
| A1SCAMSHIELD (scam-language NLP) | `NLP_CLASSIFIER` | MiniLM zero-shot + rules | fine-tuned multilingual scam classifier |
| ScamPulse signal scoring | `SCAM_SIGNAL_SCORING` | rule + reliability profile | learned confidence model |
| ScamScript Genome | `EMBEDDING` / similarity | MiniLM embeddings | curated genome dataset + ANN index |
| Fraud Journey | `INSIGHTS_JOURNEY` | prototype similarity | sequence model on labelled journeys |
| VictimState | `INSIGHTS_VICTIM_STATE` | prototype similarity | trained estimator |
| Scammer Emotion Fingerprint | `INSIGHTS_EMOTION` | (planned) | trained classifier |
| Predicted Next Move | `INSIGHTS_NEXT_MOVE` | rule map | trained predictor |
| Authenticity (deepfake/voice) | `AUTHENTICITY_*` | open-model ensemble (live) | fine-tuned checkpoint (see vigiscam-ai/training) |
| Network Graph | `IDENTITY_GRAPH` | deterministic graph | learned entity resolution |
| Unified Risk Fusion | `RISK_FUSION` | weighted scorer | learned fusion |

Each service registers its model in the registry; reviewer feedback flows back
into `model_feedback`; retraining reads `model_feedback` + eval metrics, registers
a new version (SHADOW), and is promoted to ACTIVE when its metrics beat the
incumbent. That closes the loop: **score → flag → review → correct → retrain →
re-register → promote.**

## Privacy / governance
AI decisions and feedback are internal-only (reviewer/admin/compliance roles).
Reviewer corrections are audited (`AuditLog` `AI_DECISION_REVIEWED`). No raw
victim PII is used as a training label beyond the indicator/decision itself.
