-- Migration created on juin 05, 2026
ALTER TABLE "public"."agent_mcp_actions" ADD COLUMN "userEditedInputs" JSONB DEFAULT NULL;