-- Migration created on Aug 14, 2025
CREATE INDEX CONCURRENTLY "agent_mcp_action_workspace_agent_message_execution_state" ON "agent_mcp_actions" ("workspaceId", "agentMessageId", "executionState");
