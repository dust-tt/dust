-- Migration created on Jan 15, 2026
CREATE UNIQUE INDEX CONCURRENTLY "agent_step_contents_workspace_agent_message_step_index_version" ON "agent_step_contents" ("workspaceId", "agentMessageId", "step", "index", "version");
CREATE INDEX CONCURRENTLY "agent_step_contents_workspace_id_agent_message_id" ON "agent_step_contents" ("workspaceId", "agentMessageId");
CREATE INDEX CONCURRENTLY "agent_step_contents_workspace_id_step_content_id_function_call" ON "agent_step_contents" ("workspaceId", "agentMessageId") WHERE "type"='functionCall';

DROP INDEX CONCURRENTLY "agent_step_contents_type_idx";
DROP INDEX CONCURRENTLY "agent_step_contents_workspace_id_idx";
DROP INDEX CONCURRENTLY "agent_step_contents_agent_message_id_step_index_versioned";
