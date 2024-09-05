-- Migration created on Sep 03, 2024
ALTER TABLE "public"."agent_configurations" ADD COLUMN "groupIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
