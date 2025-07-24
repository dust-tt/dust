-- Migration created on Jul 23, 2025
ALTER TABLE "public"."agent_mcp_actions" DROP COLUMN "params";
ALTER TABLE "public"."agent_mcp_actions" DROP COLUMN "functionCallId";
ALTER TABLE "public"."agent_mcp_actions" DROP COLUMN "functionCallName";
ALTER TABLE "public"."agent_mcp_actions" DROP COLUMN "step";
