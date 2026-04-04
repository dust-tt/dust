-- Migration created on Apr 4, 2026
ALTER TABLE "public"."agent_configurations" ADD COLUMN "lastAnalysedAt" TIMESTAMP WITH TIME ZONE DEFAULT NULL;
