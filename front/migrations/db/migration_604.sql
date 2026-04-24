ALTER TABLE "compaction_messages"
ADD COLUMN "sourceConversationModelId" BIGINT;

UPDATE "compaction_messages" AS "cm"
SET "sourceConversationModelId" = "c"."id"
FROM "conversations" AS "c"
WHERE "cm"."sourceConversationId" = "c"."sId"
  AND "cm"."workspaceId" = "c"."workspaceId";

ALTER TABLE "compaction_messages"
DROP COLUMN "sourceConversationId";

ALTER TABLE "compaction_messages"
RENAME COLUMN "sourceConversationModelId" TO "sourceConversationId";

ALTER TABLE "compaction_messages"
ADD CONSTRAINT "compaction_messages_source_conversation_id_fkey"
FOREIGN KEY ("sourceConversationId")
REFERENCES "conversations" ("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE INDEX CONCURRENTLY "compaction_messages_source_conversation_id"
ON "compaction_messages" ("sourceConversationId");
