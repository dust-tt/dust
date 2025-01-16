-- Migration created on Jan 15, 2025
ALTER TABLE "public"."conversations" ADD COLUMN "groupIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "public"."agent_configurations" ADD COLUMN "groupIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
