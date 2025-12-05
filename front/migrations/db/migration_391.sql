-- Migration created on Oct 24, 2025
ALTER TABLE "public"."webhook_sources"
ADD COLUMN "provider" VARCHAR(255);

UPDATE "public"."webhook_sources"
SET
    "provider" = "kind"
WHERE
    "kind" != 'custom';