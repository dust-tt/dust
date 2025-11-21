-- Migration created on Nov 03, 2025
ALTER TABLE "public"."agent_mcp_actions"
ADD COLUMN "executionDurationMs" INTEGER;