-- Migration created on Oct 24, 2025
UPDATE "public"."webhook_sources" SET "provider" = "kind" WHERE "kind" != 'custom' AND "provider" IS NULL;
ALTER TABLE "public"."webhook_sources" DROP COLUMN "kind";
