-- Migration created on Sep 23, 2025
ALTER TABLE "public"."webhook_sources" ADD COLUMN "description" TEXT;
ALTER TABLE "public"."webhook_sources" ADD COLUMN "icon" VARCHAR(255);
