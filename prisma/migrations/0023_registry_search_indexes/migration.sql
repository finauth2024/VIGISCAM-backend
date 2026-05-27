-- VIGISCAM Backend — Phase 7A migration: trigram search indexes for the
-- public registry. Defensive: if pg_trgm isn't allowlisted on this server,
-- skip the GIN indexes and log a notice. Search still works (falls back to
-- the btree index from migration 0007) — it's just slower for substring
-- queries.

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
  EXECUTE 'CREATE INDEX IF NOT EXISTS "registry_entries_indicatorValue_trgm_idx" ON "registry_entries" USING gin ("indicatorValue" gin_trgm_ops)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS "registry_entries_normalizedIndicator_trgm_idx" ON "registry_entries" USING gin ("normalizedIndicator" gin_trgm_ops)';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm not available on this server — skipping GIN trigram indexes. Substring search will fall back to btree / seq scan.';
END
$$;
