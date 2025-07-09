-- Migration created on May 13, 2025
CREATE INDEX CONCURRENTLY "agent_conv_include_file_action_w_id_agent_message_id" ON "agent_conversation_include_file_actions" ("workspaceId", "agentMessageId");
