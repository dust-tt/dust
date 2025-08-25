-- Migration created on Aug 25, 2025
ALTER TABLE "public"."triggers" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
