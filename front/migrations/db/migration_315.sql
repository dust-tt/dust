-- Migration created on Jul 23, 2025
ALTER TABLE "public"."keys" ADD COLUMN "scope" VARCHAR(255) NOT NULL DEFAULT 'default';
