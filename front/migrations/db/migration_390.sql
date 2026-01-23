-- Migration created on Oct 24, 2025
ALTER TABLE "conversations"
DROP CONSTRAINT "conversations_triggerId_fkey";

ALTER TABLE "conversations" ADD FOREIGN KEY ("triggerId") REFERENCES "triggers" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "conversations_trigger_id";

CREATE INDEX "conversations_workspace_id_trigger_id" ON "conversations" ("workspaceId", "triggerId");