-- Migraiton created on May 13, 2025
CREATE INDEX CONCURRENTLY "agent_tables_query_action_workspace_id_agent_message_id" ON "agent_tables_query_action" ("workspaceId", "agentMessageId")
