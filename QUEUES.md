# Background queues & workers (CP-9 / CP-10)

Reviewer #11 ("use BullMQ for the heavy jobs; add worker health checks +
queue dashboards/admin metrics").

## Substrate
- `QueueService` (common/queue) — typed BullMQ queues sharing the Phase-8A Redis
  connection; 3-attempt exponential backoff by default; **graceful degradation**
  (enqueue is a logged no-op when `REDIS_URL` is unset, so dev runs single-process).
- `WorkerHealthRegistry` — every worker registers on startup; surfaced in metrics.
- `QueueMetricsService` + `GET /api/v1/admin/queues` (SUPER_ADMIN / COMPLIANCE) —
  Redis status, registered workers, and per-queue BullMQ job counts
  (waiting/active/completed/failed/delayed/paused). This is the admin dashboard.

## Worker pattern
A worker is an `@Injectable()` implementing `OnModuleInit`/`OnModuleDestroy`: it
creates a BullMQ `Worker` on its queue when `REDIS_URL` is set, registers with
`WorkerHealthRegistry`, and closes on shutdown. The job handler delegates to the
owning module's service (keeps logic testable + out of the worker).

## Queue status

| Queue | Producer | Worker | Status |
|---|---|---|---|
| `notification-delivery` | `NotificationService.send` (on failure) | `NotificationRetryWorker` | ✅ live (CP-9) |
| `osint-enrichment` | `OsintService.enqueueEnrichment` / `POST /intelligence/osint/enrich/:signalId` | `OsintEnrichmentWorker` | ✅ live (CP-10) |
| `risk-processing` (AI scoring) | — | — | queue + payload defined; worker pending |
| `wallet-checks` (wallet reputation) | — | — | queue + payload defined; worker pending |
| `claim-verification` | — | — | queue + payload defined; worker pending |
| `evidence-export` | `EvidenceFileService.requestExportBundle` / `POST /evidence/:eventId/export-bundle` | `EvidenceExportWorker` | ✅ live (CP-11) |

The two live workers prove the end-to-end pattern (producer → queue → worker →
service, with backoff + health). The remaining queues have their typed contract
in `queue-names.ts`; each gets a worker as its module's async path is needed —
adding one is a single file following the same pattern.
