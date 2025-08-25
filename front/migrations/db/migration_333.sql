-- Migration created on Aug 11, 2025
ALTER TABLE "public"."agent_mcp_actions" ADD COLUMN "stepContext" JSONB NOT NULL DEFAULT '{}';
