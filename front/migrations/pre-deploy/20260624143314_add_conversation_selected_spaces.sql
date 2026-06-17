-- Migration created on Jun 24, 2026
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE TABLE IF NOT EXISTS "conversation_selected_spaces" (
    "createdAt" timestamp WITH time zone NOT NULL DEFAULT NOW(),
    "updatedAt" timestamp WITH time zone NOT NULL DEFAULT NOW(),
    "conversationId" bigint NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "spaceId" bigint NOT NULL REFERENCES "spaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "selectedByUserId" bigint NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "origin" varchar(255) NOT NULL,
    "removedAt" timestamp WITH time zone,
    "workspaceId" bigint NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id" bigserial,
    PRIMARY KEY ("id")
);

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY "conversation_selected_spaces_wid_cid_sid" ON "conversation_selected_spaces" ("workspaceId", "conversationId", "spaceId");

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY "conversation_selected_spaces_conversation_id" ON "conversation_selected_spaces" ("conversationId");

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY "conversation_selected_spaces_space_id" ON "conversation_selected_spaces" ("spaceId");

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY "conversation_selected_spaces_selected_by_user_id" ON "conversation_selected_spaces" ("selectedByUserId");
