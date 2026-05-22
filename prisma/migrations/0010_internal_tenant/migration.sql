-- VIGISCAM Backend — Phase 3E migration: seed the VIGISCAM internal tenant.
-- Internal VIGISCAM staff (SUPER_ADMIN / REVIEWER / COMPLIANCE_OFFICER /
-- SUPPORT) hold their roles via a Membership on this single INTERNAL tenant.
-- The id is fixed so application code can reference it deterministically.

INSERT INTO "tenants" ("id", "name", "type", "status", "createdAt", "updatedAt")
VALUES ('11111111-1111-4111-8111-111111111111', 'VIGISCAM Internal', 'INTERNAL', 'ACTIVE', NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;
