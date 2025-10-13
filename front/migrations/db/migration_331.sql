-- Migration created on Aug 08, 2025
ALTER TABLE "public"."agent_mcp_actions" ADD COLUMN "augmentedInputs" JSONB NOT NULL DEFAULT '{}';
