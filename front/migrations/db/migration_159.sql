------------------------------------------
-------- agent_browse_actions ------------
------------------------------------------
-- Backfill workspaceId from the relationship chain:
-- agent_browse_actions -> agent_messages
ALTER TABLE "public"."agent_browse_actions" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE agent_browse_actions
SET "workspaceId" = agent_messages."workspaceId"
FROM agent_messages
WHERE agent_browse_actions."agentMessageId" = agent_messages.id;


------------------------------------------
------- agent_browse_configurations ------
------------------------------------------
-- Backfill workspaceId from agent_configurations -> workspaces
ALTER TABLE "public"."agent_browse_configurations" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE agent_browse_configurations
SET "workspaceId" = agent_configurations."workspaceId"
FROM agent_configurations
WHERE agent_browse_configurations."agentConfigurationId" = agent_configurations.id;


------------------------------------------------------
------- agent_conversation_include_file_actions ------
------------------------------------------------------
-- Backfill workspaceId from the relationship chain:
-- agent_conversation_include_file_actions -> agent_messages -> workspaces
ALTER TABLE "public"."agent_conversation_include_file_actions" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE agent_conversation_include_file_actions
SET "workspaceId" = agent_messages."workspaceId"
FROM agent_messages
WHERE agent_conversation_include_file_actions."agentMessageId" = agent_messages.id;

-----------------------------------------------
------- agent_data_source_configurations ------
-----------------------------------------------
-- Backfill workspaceId from the relationship chain:
-- agent_data_source_configurations -> data_source_views -> workspaces
ALTER TABLE "public"."agent_data_source_configurations" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE agent_data_source_configurations
SET "workspaceId" = data_source_views."workspaceId"
FROM data_source_views
WHERE agent_data_source_configurations."dataSourceViewId" = data_source_views.id;


-----------------------------------------------
--------- agent_dust_app_run_actions ----------
-----------------------------------------------
-- Backfill workspaceId from the relationship chain:
-- agent_dust_app_run_actions -> agent_messages -> workspaces
ALTER TABLE "public"."agent_dust_app_run_actions" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE agent_dust_app_run_actions
SET "workspaceId" = agent_messages."workspaceId"
FROM agent_messages
WHERE agent_dust_app_run_actions."agentMessageId" = agent_messages.id;


-----------------------------------------------
------ agent_dust_app_run_configurations ------
-----------------------------------------------
-- Backfill workspaceId from the relationship chain:
-- agent_dust_app_run_configurations -> agent_configurations -> workspaces
ALTER TABLE "public"."agent_dust_app_run_configurations" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE agent_dust_app_run_configurations
SET "workspaceId" = agent_configurations."workspaceId"
FROM agent_configurations
WHERE agent_dust_app_run_configurations."agentConfigurationId" = agent_configurations.id;


-----------------------------------------------
------------ agent_message_contents -----------
-----------------------------------------------
-- Backfill workspaceId from the relationship chain:
-- agent_message_contents -> agent_messages -> workspaces
ALTER TABLE "public"."agent_message_contents" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE agent_message_contents
SET "workspaceId" = agent_messages."workspaceId"
FROM agent_messages
WHERE agent_message_contents."agentMessageId" = agent_messages.id;

-----------------------------------------------
------------ agent_process_actions ------------
-----------------------------------------------
-- Backfill workspaceId from the relationship chain:
-- agent_process_actions -> agent_messages -> messages -> conversations -> workspaces
ALTER TABLE "public"."agent_process_actions" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE agent_process_actions
SET "workspaceId" = agent_messages."workspaceId"
FROM agent_messages
WHERE agent_process_actions."agentMessageId" = agent_messages.id;

-----------------------------------------------
--------- agent_process_configurations --------
-----------------------------------------------
-- Backfill workspaceId from the relationship chain:
-- agent_process_configurations -> agent_configurations -> workspaces
ALTER TABLE "public"."agent_process_configurations" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE agent_process_configurations
SET "workspaceId" = agent_configurations."workspaceId"
FROM agent_configurations
WHERE agent_process_configurations."agentConfigurationId" = agent_configurations.id;

-----------------------------------------------
----------- agent_retrieval_actions -----------
-----------------------------------------------
-- Backfill workspaceId from the relationship chain:
-- agent_retrieval_actions -> agent_messages -> workspaces
ALTER TABLE "public"."agent_retrieval_actions" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE agent_retrieval_actions
SET "workspaceId" = agent_messages."workspaceId"
FROM agent_messages
WHERE agent_retrieval_actions."agentMessageId" = agent_messages.id;


-----------------------------------------------
-------- agent_retrieval_configurations -------
-----------------------------------------------
-- Backfill workspaceId from the relationship chain:
-- agent_retrieval_configurations -> agent_configurations
ALTER TABLE "public"."agent_retrieval_configurations" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE agent_retrieval_configurations
SET "workspaceId" = agent_configurations."workspaceId"
FROM agent_configurations
WHERE agent_retrieval_configurations."agentConfigurationId" = agent_configurations.id;

-----------------------------------------------
-------- agent_tables_query_actions -----------
-----------------------------------------------
-- Backfill workspaceId from the relationship chain:
-- agent_tables_query_actions -> agent_messages -> workspaces
ALTER TABLE "public"."agent_tables_query_actions" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE agent_tables_query_actions
SET "workspaceId" = agent_messages."workspaceId"
FROM agent_messages
WHERE agent_tables_query_actions."agentMessageId" = agent_messages.id;

-----------------------------------------------
--- agent_tables_query_configuration_tables ---
-----------------------------------------------
-- Backfill workspaceId from the relationship chain:
-- agent_tables_query_configuration_tables -> agent_configurations
ALTER TABLE "public"."agent_tables_query_configuration_tables" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE agent_tables_query_configuration_tables
SET "workspaceId" = agent_configurations."workspaceId"
FROM agent_tables_query_configurations
JOIN agent_configurations ON agent_tables_query_configurations."agentConfigurationId" = agent_configurations.id
WHERE agent_tables_query_configuration_tables."tablesQueryConfigurationId" = agent_tables_query_configurations.id;

-----------------------------------------------
------ agent_tables_query_configurations ------
-----------------------------------------------
-- Backfill workspaceId from the relationship chain:
-- agent_tables_query_configurations -> agent_configurations
ALTER TABLE "public"."agent_tables_query_configurations" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE agent_tables_query_configurations
SET "workspaceId" = agent_configurations."workspaceId"
FROM agent_configurations
WHERE agent_tables_query_configurations."agentConfigurationId" = agent_configurations.id;

-----------------------------------------------
----------- agent_websearch_actions -----------
-----------------------------------------------
-- Backfill workspaceId from the relationship chain:
-- agent_websearch_actions -> agent_messages -> workspaces
ALTER TABLE "public"."agent_websearch_actions" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE agent_websearch_actions
SET "workspaceId" = agent_messages."workspaceId"
FROM agent_messages
WHERE agent_websearch_actions."agentMessageId" = agent_messages.id;

-----------------------------------------------
--------- agent_websearch_configurations ------
-----------------------------------------------
-- Backfill workspaceId from the relationship chain:
-- agent_websearch_configurations -> agent_configurations
ALTER TABLE "public"."agent_websearch_configurations" ADD COLUMN "workspaceId" BIGINT REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE agent_websearch_configurations
SET "workspaceId" = agent_configurations."workspaceId"
FROM agent_configurations
WHERE agent_websearch_configurations."agentConfigurationId" = agent_configurations.id;