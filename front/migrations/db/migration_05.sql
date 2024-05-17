-- Migration created on May 17, 2024
CREATE INDEX CONCURRENTLY "conversation_participants_conversation_id" ON "conversation_participants" ("conversationId");
CREATE INDEX CONCURRENTLY "messages_agent_message_id" ON "messages" ("agentMessageId");
CREATE INDEX CONCURRENTLY "messages_user_message_id" ON "messages" ("userMessageId");
CREATE INDEX CONCURRENTLY "messages_content_fragment_id" ON "messages" ("contentFragmentId");
CREATE INDEX CONCURRENTLY "messages_parent_id" ON "messages" ("parentId");
CREATE INDEX CONCURRENTLY "message_reactions_user_id" ON "message_reactions" ("userId");
CREATE INDEX CONCURRENTLY "mentions_user_id" ON "mentions" ("userId");
