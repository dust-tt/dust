-- Migration created on Feb 02, 2026
-- Add dailyCapMicroUsd column to programmatic_usage_configurations table
-- This column stores the daily spending cap in microUSD (null = use default algorithm)

ALTER TABLE "public"."programmatic_usage_configurations"
ADD COLUMN "dailyCapMicroUsd" BIGINT DEFAULT NULL;
