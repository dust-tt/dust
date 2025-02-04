-- Migration created on Jan 21, 2025
ALTER TABLE "public"."remote_databases" ADD COLUMN "permission" VARCHAR(255) NOT NULL DEFAULT 'selected';
ALTER TABLE "public"."remote_schemas" ADD COLUMN "permission" VARCHAR(255) NOT NULL DEFAULT 'selected';
