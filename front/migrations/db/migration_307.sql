-- Migration created on Jul 09, 2025
ALTER TABLE "public"."agent_mcp_actions" ADD COLUMN "stepContentId" BIGINT REFERENCES "agent_step_contents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;