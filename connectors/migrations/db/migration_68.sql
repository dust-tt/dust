-- Migration created on Apr 25, 2025
ALTER TABLE "public"."confluence_configurations" ADD COLUMN "ignoreNearRateLimit" BOOLEAN DEFAULT false;
