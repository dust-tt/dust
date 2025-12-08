-- Migration created on Dec 03, 2024
-- Add useCases column to workspace_has_domains table
-- Default is ['sso'] for backward compatibility with existing domains
ALTER TABLE "public"."workspace_has_domains"
ADD COLUMN "useCases" VARCHAR(255)[] NOT NULL DEFAULT ARRAY['sso']::VARCHAR[];
