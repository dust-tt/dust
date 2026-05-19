-- Migration created on May 19, 2026

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "agent_step_content_tool_executions_agent_mcp_action_id"
ON "public"."agent_step_content_tool_executions" ("agentMCPActionId");
