-- Migration created on May 17, 2024
CREATE INDEX "conversation_participants_conversation_id" ON "conversation_participants" ("conversationId")
CREATE INDEX "messages_agent_message_id" ON "messages" ("agentMessageId")
CREATE INDEX "messages_user_message_id" ON "messages" ("userMessageId")
CREATE INDEX "messages_content_fragment_id" ON "messages" ("contentFragmentId")
CREATE INDEX "messages_parent_id" ON "messages" ("parentId")
CREATE INDEX "message_reactions_user_id" ON "message_reactions" ("userId")
CREATE INDEX "mentions_user_id" ON "mentions" ("userId")
