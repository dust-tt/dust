UPDATE "compaction_messages" AS "cm"
SET "sourceConversationId" = NULL
WHERE "sourceConversationId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "conversations" AS "c"
    WHERE "c"."workspaceId" = "cm"."workspaceId"
      AND "c"."sId" = "cm"."sourceConversationId"
  );

CREATE INDEX CONCURRENTLY "compaction_messages_workspace_id_source_conversation_id_idx"
  ON "compaction_messages" ("workspaceId", "sourceConversationId");

ALTER TABLE "compaction_messages"
ADD CONSTRAINT "compaction_messages_workspace_id_source_conversation_id_fkey"
FOREIGN KEY ("workspaceId", "sourceConversationId")
REFERENCES "conversations" ("workspaceId", "sId")
ON DELETE RESTRICT
ON UPDATE CASCADE
NOT VALID;

ALTER TABLE "compaction_messages"
VALIDATE CONSTRAINT "compaction_messages_workspace_id_source_conversation_id_fkey";
