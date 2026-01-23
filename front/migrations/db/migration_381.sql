-- Migration created on Oct 09, 2025
ALTER TABLE "public"."conversations" ADD COLUMN "hasError" BOOLEAN NOT NULL DEFAULT FALSE;
