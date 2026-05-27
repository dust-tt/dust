-- Migration created on May 26, 2026
-- Add disableCreditCapWarning to credit_usage_configurations: when true, the
-- credit cap warning email to workspace admins is suppressed. Default is
-- false so workspaces without a row still receive the warning.

ALTER TABLE "public"."credit_usage_configurations"
  ADD COLUMN "disableCreditCapWarning" BOOLEAN NOT NULL DEFAULT false;
