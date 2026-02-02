-- Migration created on Jan 26, 2026
CREATE TABLE IF NOT EXISTS "project_journal_entries"
(
    "createdAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"            TIMESTAMP WITH TIME ZONE NOT NULL,
    "journalEntry"         TEXT                     NOT NULL,
    "workspaceId"          BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                   BIGSERIAL,
    "spaceId"              BIGINT                   NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "sourceConversationId" BIGINT REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "userId"               BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY "project_journal_entries_workspace_id_space_id_user_id"
    ON "project_journal_entries" ("workspaceId", "spaceId", "userId");
CREATE INDEX CONCURRENTLY "project_journal_entries_source_conversation_id"
    ON "project_journal_entries" ("sourceConversationId");
