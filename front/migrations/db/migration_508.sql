-- Migration created on Feb. 05, 2026
-- Migrate public spaces to regular spaces.
-- Public spaces are being deprecated in favor of using regular spaces with appropriate
-- group permissions. This migration converts all existing public spaces to regular spaces.
UPDATE "public"."vaults" SET "kind" = 'regular' WHERE "kind" = 'public';
