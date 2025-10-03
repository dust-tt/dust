-- Migration created on Oct 03, 2025
ALTER TABLE "public"."webhook_sources" ADD COLUMN "secretLocation" VARCHAR(255);
