-- Migration created on May 28, 2026
-- Drop the old "paygCapCredits" column on credit_usage_configurations. It has
-- been replaced by "usageCapCredits" (added in migration_655), which decouples
-- the workspace-level AWU usage cap from the PAYG-enabled flag.

ALTER TABLE "public"."credit_usage_configurations"
  DROP COLUMN "paygCapCredits";
