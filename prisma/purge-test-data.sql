-- ============================================================================
-- VIGISCAM — pre-launch test-data purge
-- ----------------------------------------------------------------------------
-- Wipes all TRANSACTIONAL / test data created during development + acceptance
-- runs, while PRESERVING:
--   * the database schema (no DROP),
--   * seed/config tables: source_reliability_profiles, scam_categories,
--     takedown_provider_templates, model_registry, ACTIVE detection_rules,
--   * the platform admin account + its tenant (contract-tests@vigiscam.local).
--
-- Runs in a single transaction — all-or-nothing. Review the two IDs below
-- before running; change them if you want to keep a different admin.
--
--   ADMIN USER  : c4a52358-4d1d-4342-939b-6347b45a595d  (contract-tests@vigiscam.local)
--   ADMIN TENANT: 11111111-1111-4111-8111-111111111111
-- ============================================================================

BEGIN;

-- 1) Truncate every transactional / generated table. CASCADE clears child rows
--    (e.g. signal evidence, registry appeals) and RESTART IDENTITY resets any
--    serial counters. None of these hold seed data.
TRUNCATE TABLE
  -- protection modules
  pause_events, scamhold_events, giftcard_warnings, wallet_checks, claim_verifications,
  scammirror_sessions, session_events, sessions,
  -- intelligence pipeline
  scam_signals, scam_signal_evidence, signal_embeddings, signal_similarities,
  scam_clusters, fraud_graph_nodes, fraud_graph_edges,
  registry_entries, registry_review_queue, registry_appeals, takedown_requests,
  -- risk + AI
  risk_events, risk_fusion_assessments, fraud_journey_assessments,
  victim_state_assessments, predicted_next_moves,
  ai_decisions, model_feedback, authenticity_checks, osint_enrichments,
  -- evidence vault
  evidence_events, evidence_files, evidence_export_bundles,
  -- alerts / notifications / audit / checks
  alerts, notification_deliveries, public_alerts, scam_check_results,
  freezelock_events, audit_logs,
  -- billing (subscriptions re-sync from Stripe on next event)
  billing_events, tenant_subscriptions,
  -- contacts / devices / partner keys / webhooks
  trusted_contacts, trusted_contact_reviews, guardian_links, devices,
  webhook_deliveries, webhook_subscriptions, partner_api_keys, partner_api_key_usage,
  -- role-portal data
  bank_case_reviews, teller_assist_scores, grooming_check_scores,
  platform_moderation_decisions,
  investigator_cases, investigator_case_clusters, investigator_case_evidence,
  investigator_case_notes,
  enterprise_integrations, enterprise_policies, agency_feeds, agency_feed_deliveries
RESTART IDENTITY CASCADE;

-- 2) Drop test-generated DRAFT detection rules (keep any ACTIVE/seed rules).
DELETE FROM detection_rules WHERE status = 'DRAFT';

-- 3) Remove every user + tenant EXCEPT the admin. The ON DELETE CASCADE FKs on
--    memberships / user_profiles / protection_settings / refresh_tokens clear
--    those rows for the removed accounts automatically; the admin's own rows
--    are kept.
DELETE FROM users   WHERE id <> 'c4a52358-4d1d-4342-939b-6347b45a595d';
DELETE FROM tenants WHERE id <> '11111111-1111-4111-8111-111111111111';

COMMIT;

-- Sanity check (run after COMMIT):
--   SELECT (SELECT count(*) FROM users)   AS users,
--          (SELECT count(*) FROM tenants) AS tenants,
--          (SELECT count(*) FROM scam_signals) AS signals,
--          (SELECT count(*) FROM pause_events) AS pauses;
-- Expect: users=1, tenants=1, signals=0, pauses=0.
