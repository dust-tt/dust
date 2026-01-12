-- Migration created on Jan 05, 2026
CREATE INDEX CONCURRENTLY "data_sources_conversation_id" ON "data_sources" ("conversationId");
CREATE INDEX CONCURRENTLY "conversation_mcp_server_views_conversation_id" ON "conversation_mcp_server_views" ("conversationId");
CREATE INDEX CONCURRENTLY "agent_mcp_actions_agent_message_id" ON "agent_mcp_actions" ("agentMessageId");
CREATE INDEX CONCURRENTLY "idx_conversation_skills_conversation_id" ON "conversation_skills" ("conversationId");
CREATE INDEX CONCURRENTLY "idx_agent_message_skills_conversation_id" ON "agent_message_skills" ("conversationId");
CREATE INDEX CONCURRENTLY "idx_agent_message_skills_agent_message_id" ON "agent_message_skills" ("agentMessageId");
