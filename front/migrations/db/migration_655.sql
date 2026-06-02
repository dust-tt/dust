-- Migration created on May 28, 2026
-- Decouple the AWU usage cap from the PAYG-enabled flag on
-- credit_usage_configurations:
--   1. Add "usageCapCredits". The column is a workspace-level usage cap (in AWU
--      credits) that drives the Metronome spend_threshold_reached alert; it is
--      not specific to PAYG and can be set even when PAYG is not enabled. It
--      replaces the old "paygCapCredits" column, which is dropped in a
--      subsequent migration.
--   2. Add "paygEnabled" boolean so PAYG mode (which controls the AWU contract
--      excess-credits recurring credit) is independent from the usage cap.

ALTER TABLE "public"."credit_usage_configurations"
  ADD COLUMN "usageCapCredits" INTEGER;

ALTER TABLE "public"."credit_usage_configurations"
  ADD COLUMN "paygEnabled" BOOLEAN NOT NULL DEFAULT false;
