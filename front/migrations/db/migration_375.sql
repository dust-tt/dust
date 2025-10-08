-- Migration created on Oct 07, 2025
ALTER TABLE "public"."webhook_sources" ADD COLUMN "subscribedEvents" VARCHAR(255)[];
UPDATE "public"."webhook_sources" SET "subscribedEvents" = ARRAY[]::VARCHAR(255)[] WHERE "subscribedEvents" IS NULL;
ALTER TABLE "public"."webhook_sources" ALTER COLUMN "subscribedEvents" SET NOT NULL;
