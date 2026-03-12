-- Migration created on Feb 27, 2026
CREATE TABLE
    IF NOT EXISTS "conversation_branches" (
        "createdAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "updatedAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "state" VARCHAR(255) NOT NULL,
            "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "id" BIGSERIAL,
            "conversationId" BIGINT NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "userId" BIGINT NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "previousMessageId" BIGINT NOT NULL REFERENCES "messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            PRIMARY KEY ("id")
    );

CREATE INDEX "conversation_branches_workspace_id_conversation_id_user_id" ON "conversation_branches" ("workspaceId", "conversationId", "userId");

CREATE UNIQUE INDEX "conversation_branches_previous_message_id" ON "conversation_branches" ("previousMessageId");

ALTER TABLE "public"."messages"
ADD COLUMN "branchId" BIGINT DEFAULT NULL;

CREATE UNIQUE INDEX CONCURRENTLY "messages_workspace_id_conversation_id_rank_version_branch_null" ON "messages" (
    "workspaceId",
    "conversationId",
    "rank",
    "version"
)
WHERE
    "branchId" IS NULL;

CREATE UNIQUE INDEX CONCURRENTLY "messages_workspace_id_conversation_id_rank_version_branch_id" ON "messages" (
    "workspaceId",
    "conversationId",
    "rank",
    "version",
    "branchId"
)
WHERE
    "branchId" IS NOT NULL;

CREATE INDEX CONCURRENTLY "messages_branch_id" ON "messages" ("branchId");