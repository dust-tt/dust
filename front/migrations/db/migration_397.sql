-- Migration created on Oct 31, 2025
ALTER TABLE "public"."run_usages" ADD COLUMN "cacheCreationTokens" INTEGER DEFAULT NULL;

