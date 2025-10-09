-- Migration created on Oct 09, 2025
ALTER TABLE "public"."gong_configurations" ADD COLUMN "accountsEnabled" BOOLEAN NOT NULL DEFAULT false;
