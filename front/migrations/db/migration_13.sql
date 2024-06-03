-- Migration created on Jun 03, 2024
CREATE UNIQUE INDEX CONCURRENTLY "agent_retrieval_configurations_s_id" ON "agent_retrieval_configurations" ("sId");

CREATE INDEX CONCURRENTLY "agent_retrieval_configurations_force_use_at_iteration" ON "agent_retrieval_configurations" ("forceUseAtIteration");

CREATE INDEX CONCURRENTLY "agent_dust_app_run_configurations_agent_configuration_id" ON "agent_dust_app_run_configurations" ("agentConfigurationId");

CREATE INDEX CONCURRENTLY "agent_dust_app_run_configurations_force_use_at_iteration" ON "agent_dust_app_run_configurations" ("forceUseAtIteration");

CREATE INDEX CONCURRENTLY "agent_tables_query_configurations_agent_configuration_id" ON "agent_tables_query_configurations" ("agentConfigurationId");

CREATE INDEX CONCURRENTLY "agent_tables_query_configurations_force_use_at_iteration" ON "agent_tables_query_configurations" ("forceUseAtIteration");

CREATE INDEX CONCURRENTLY "agent_process_configurations_force_use_at_iteration" ON "agent_process_configurations" ("forceUseAtIteration");

CREATE UNIQUE INDEX CONCURRENTLY "agent_process_configurations_s_id" ON "agent_process_configurations" ("sId");

CREATE INDEX CONCURRENTLY "agent_process_configurations_agent_configuration_id" ON "agent_process_configurations" ("agentConfigurationId");

CREATE INDEX CONCURRENTLY "agent_websearch_configurations_agent_configuration_id" ON "agent_websearch_configurations" ("agentConfigurationId");

CREATE INDEX CONCURRENTLY "agent_websearch_configurations_force_use_at_iteration" ON "agent_websearch_configurations" ("forceUseAtIteration");