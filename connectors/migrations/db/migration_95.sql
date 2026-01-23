-- Migration created on Sep 29, 2025
ALTER TABLE "public"."confluence_spaces" ADD COLUMN "deletedAt" TIMESTAMP WITH TIME ZONE;
