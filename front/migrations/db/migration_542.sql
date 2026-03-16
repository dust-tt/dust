-- Migration created on Mar 18, 2026
ALTER TABLE "public"."agent_suggestions"
    ADD COLUMN "conversationId" BIGINT REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMENT ON COLUMN "agent_suggestions"."conversationId" IS 'FK to the conversation that triggered this suggestion (only set for synthetic suggestions)';
CREATE INDEX CONCURRENTLY "agent_suggestions_workspace_id_conversation_id" ON "agent_suggestions" ("workspaceId", "conversationId");
