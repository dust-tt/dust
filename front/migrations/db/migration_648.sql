-- Migration created on May 21, 2026
CREATE INDEX CONCURRENTLY "agent_step_content_tool_executions_agent_message_id" ON "agent_step_content_tool_executions" ("agentMessageId");
