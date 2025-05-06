-- Migration created on Apr 02, 2025
ALTER TABLE "public"."agent_configurations" ADD COLUMN "responseFormat" JSONB DEFAULT NULL;
