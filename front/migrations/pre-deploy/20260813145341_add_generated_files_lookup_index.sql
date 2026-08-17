/*
Statement 0
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 3600000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY IF EXISTS agent_mcp_action_output_items_ws_action_file_id;
CREATE INDEX CONCURRENTLY agent_mcp_action_output_items_ws_action_file_id ON public.agent_mcp_action_output_items USING btree ("workspaceId", "agentMCPActionId", "fileId", id) WHERE ("fileId" IS NOT NULL);
