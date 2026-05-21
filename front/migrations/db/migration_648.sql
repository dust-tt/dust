-- Migration created on May 21, 2026
CREATE INDEX CONCURRENTLY "agent_sc_te_workspace_message" ON "agent_step_content_tool_executions" ("workspaceId", "agentMessageId");
