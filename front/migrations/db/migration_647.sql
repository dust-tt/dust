-- Migration created on May 20, 2026
ALTER TABLE "public"."project_metadata"
ADD COLUMN "pinnedFramePath" VARCHAR(255);
