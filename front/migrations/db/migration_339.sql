-- Migration created on Aug 20, 2025
ALTER TABLE "public"."agent_mcp_actions" ADD COLUMN "runningState" VARCHAR(255) NOT NULL DEFAULT 'completed';
ALTER TABLE "public"."agent_mcp_actions" ALTER COLUMN "runningState" DROP DEFAULT;
