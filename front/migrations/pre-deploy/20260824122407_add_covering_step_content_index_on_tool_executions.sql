/*
Statement 0
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY agent_sc_te_step_content_workspace_action ON public.agent_step_content_tool_executions USING btree ("stepContentId", "workspaceId", "agentMCPActionId");

/*
Statement 1
  - Superseded by the index above, which leads on the same column: it serves the same lookups and
    the stepContentId foreign key check.
  - INDEX_DROPPED: Dropping this index means queries that use this index might perform worse because they will no longer will be able to leverage it.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY "public"."agent_step_content_tool_executions_step_content_id";
