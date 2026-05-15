-- Migration created on mai 15, 2026
DROP INDEX CONCURRENTLY IF EXISTS "agent_mcp_action_workspace_agent_message_step_content_version";
DROP INDEX CONCURRENTLY IF EXISTS "agent_mcp_actions_step_content_id";

ALTER TABLE "public"."agent_mcp_actions" DROP COLUMN "version";
ALTER TABLE "public"."agent_mcp_actions" DROP COLUMN "stepContentId";