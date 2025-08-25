-- Migration created on Aug 24, 2025
ALTER TABLE "public"."agent_mcp_actions" DROP COLUMN "executionState";
ALTER TABLE "public"."agent_mcp_actions" DROP COLUMN "runningState";
ALTER TABLE "public"."agent_mcp_actions" DROP COLUMN "isError";
