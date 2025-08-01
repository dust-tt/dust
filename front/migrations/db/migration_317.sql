-- Migration created on Jul 23, 2025
ALTER TABLE "public"."agent_mcp_actions" ALTER COLUMN "params" DROP NOT NULL ;
ALTER TABLE "public"."agent_mcp_actions" ALTER COLUMN "functionCallId" DROP NOT NULL;
ALTER TABLE "public"."agent_mcp_actions" ALTER COLUMN "functionCallName" DROP NOT NULL;
ALTER TABLE "public"."agent_mcp_actions" ALTER COLUMN "step" DROP NOT NULL;
