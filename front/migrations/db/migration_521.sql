-- Migration created on Feb 24, 2026
ALTER TABLE "public"."project_metadata"
ADD COLUMN "archivedAt" TIMESTAMP
WITH
    TIME ZONE;