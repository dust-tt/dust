-- Migration created on Jul 25, 2025
CREATE UNIQUE INDEX CONCURRENTLY "agent_mcp_action_workspace_agent_message_step_content_version" ON "agent_mcp_actions" ("workspaceId", "agentMessageId", "stepContentId", "version");
