-- Migration created on Mar 16, 2026
-- Add groupIds column to feature_flags table for per-group feature flag targeting.
-- NULL means workspace-wide (current behavior), an array of group IDs means the flag
-- is only enabled for users who belong to at least one of those groups.
ALTER TABLE "feature_flags"
    ADD COLUMN "groupIds" INTEGER[] DEFAULT NULL;
