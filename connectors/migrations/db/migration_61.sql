-- Migration created on Mar 05, 2025
ALTER TABLE "public"."gong_configurations" ADD COLUMN "baseUrl" VARCHAR(255) NOT NULL;
