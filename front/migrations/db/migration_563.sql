-- Migration created on Apr 03, 2026
ALTER TABLE "public"."run_usages" ADD COLUMN "isBatch" BOOLEAN NOT NULL DEFAULT false;
