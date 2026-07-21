/*
Statement 0
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY partial_agent_config_active_scope_id ON public.agent_configurations USING btree ("workspaceId", scope, id) WHERE ((status)::text = 'active'::text);
