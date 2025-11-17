-- Migration created on Oct 20, 2025
ALTER TABLE "public"."triggers" ADD COLUMN "executionPerDayLimitOverride" INTEGER DEFAULT NULL;
ALTER TABLE "public"."webhook_request_triggers" ADD COLUMN "errorMessage" TEXT DEFAULT NULL;
