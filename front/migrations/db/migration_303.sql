-- Migration created on Jul 08, 2025
ALTER TABLE "public"."agent_step_contents" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."agent_mcp_actions" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
