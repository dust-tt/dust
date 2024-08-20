-- Migration created on Aug 20, 2024
ALTER TABLE "public"."data_source_views" ADD COLUMN "kind" VARCHAR(255) NOT NULL DEFAULT 'default';
