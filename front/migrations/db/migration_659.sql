-- Migration created on Jun 01, 2026
-- Add "balanceThresholdCredits" to credit_usage_configurations. It is a
-- workspace-level credit-balance threshold (in AWU credits): admins set a value
-- below which they want to be alerted. NULL means no threshold is configured.

ALTER TABLE "public"."credit_usage_configurations"
  ADD COLUMN "balanceThresholdCredits" INTEGER;
