-- Migration created on May 28, 2026
-- Decouple the AWU usage cap from the PAYG-enabled flag on
-- credit_usage_configurations:
--   1. Rename "paygCapCredits" to "usageCapCredits". The column is a
--      workspace-level usage cap (in AWU credits) that drives the Metronome
--      spend_threshold_reached alert; it is not specific to PAYG and can be
--      set even when PAYG is not enabled.
--   2. Add "paygEnabled" boolean so PAYG mode (which controls the AWU
--      contract excess-credits recurring credit) is independent from the
--      usage cap. Backfill to true wherever a cap was previously set, since
--      under the old model that was the only way PAYG could be enabled.

ALTER TABLE "public"."credit_usage_configurations"
  RENAME COLUMN "paygCapCredits" TO "usageCapCredits";

ALTER TABLE "public"."credit_usage_configurations"
  ADD COLUMN "paygEnabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "public"."credit_usage_configurations"
  SET "paygEnabled" = true
  WHERE "usageCapCredits" IS NOT NULL;
