-- Migration created on Nov 07, 2025
ALTER TABLE "public"."triggers" ADD COLUMN "executionMode" VARCHAR(255);
