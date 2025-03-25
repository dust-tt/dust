-- Migration created on Mar 25, 2025
ALTER TABLE "public"."content_fragments" ADD COLUMN "nodeType" VARCHAR(255);
UPDATE "public"."content_fragments" SET "nodeType" = 'document' WHERE "nodeId" IS NOT NULL;
