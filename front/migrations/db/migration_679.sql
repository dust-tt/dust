-- Migration created on Jun 8, 2026
-- Workspace-wide default per-user pool cap (in AWU credits, seat allowance
-- excluded). Stored on credit_usage_configurations alongside the other
-- credit-usage knobs. NULL means no default is configured.
SET statement_timeout = '2s';
SET lock_timeout = '2s';
ALTER TABLE "public"."credit_usage_configurations" ADD COLUMN "defaultPoolCapAwuCredits" INTEGER;
