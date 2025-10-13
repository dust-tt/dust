-- Migration created on Oct 07, 2025
ALTER TABLE "public"."webhook_sources" ADD COLUMN "kind" VARCHAR(255);
UPDATE "public"."webhook_sources" SET "kind" = 'custom' WHERE "kind" IS NULL;
ALTER TABLE "public"."webhook_sources" ALTER COLUMN "kind" SET NOT NULL;
