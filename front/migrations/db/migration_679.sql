-- Migration created on Jun 12, 2026
ALTER TABLE "public"."project_metadata" ADD COLUMN "defaultAgentId" VARCHAR(255) DEFAULT NULL;
