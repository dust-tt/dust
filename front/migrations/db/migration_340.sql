-- Migration created on Aug 20, 2025
ALTER TABLE "public"."agent_mcp_actions" ADD COLUMN "status" VARCHAR(255) DEFAULT 'succeeded';
CREATE INDEX CONCURRENTLY "agent_mcp_action_workspace_agent_message_status" ON "agent_mcp_actions" ("workspaceId", "agentMessageId", "status");
