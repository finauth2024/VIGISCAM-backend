-- VIGISCAM Backend — LR-2 legal & public-safety checkpoint migration.
-- Adds the public-safe status vocabulary (PDF §38, docs/04 §3) — the only
-- classifications allowed on a public-facing registry entry.

-- CreateEnum
CREATE TYPE "RegistryPublicStatus" AS ENUM ('VERIFIED_MALICIOUS', 'HIGH_RISK_VERIFIED', 'OFFICIALLY_REPORTED', 'TAKEDOWN_CONFIRMED');

-- AlterTable
ALTER TABLE "registry_entries" ADD COLUMN     "publicStatus" "RegistryPublicStatus";
