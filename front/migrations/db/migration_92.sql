-- Migration created on Sep 25, 2024
ALTER TABLE "public"."data_sources"
ADD COLUMN "deletedAt" TIMESTAMP
WITH
  TIME ZONE;

ALTER TABLE "public"."data_source_views"
ADD COLUMN "deletedAt" TIMESTAMP
WITH
  TIME ZONE;