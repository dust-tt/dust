-- Migration created on Jun 16, 2026
ALTER TABLE "public"."credit_usage_configurations"
ADD COLUMN "autoSeatUpgradeEnabled" BOOLEAN NOT NULL DEFAULT false;
