-- Migration created on Jul 16, 2025
CREATE INDEX CONCURRENTLY "agent_mcp_actions_step_content_id" ON "agent_mcp_actions" ("stepContentId");
