-- Migration created on Sep 02, 2025
ALTER TABLE "public"."run_usages" ADD COLUMN "cachedTokens" INTEGER DEFAULT NULL;
