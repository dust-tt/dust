-- Migration created on May 15, 2025
ALTER TABLE "public"."tags" ADD COLUMN "kind" VARCHAR(255) DEFAULT 'standard';
