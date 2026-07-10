/*
Statement 0
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY "wake_ups_workspace_id_agent_configuration_id_idx" ON public.wake_ups USING btree ("workspaceId", "agentConfigurationId");
