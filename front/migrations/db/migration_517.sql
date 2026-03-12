ALTER TABLE "agent_message_feedbacks" ADD COLUMN "conversationId" BIGINT REFERENCES "conversations" ("id");
CREATE INDEX CONCURRENTLY "agent_message_feedbacks_workspace_id_conversation_id" ON "agent_message_feedbacks" ("workspaceId", "conversationId");
