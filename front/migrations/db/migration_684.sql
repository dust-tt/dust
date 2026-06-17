-- Migration created on Jun 17, 2026
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

CREATE UNIQUE INDEX CONCURRENTLY "conversation_selected_spaces_wid_cid_sid" ON "conversation_selected_spaces" ("workspaceId", "conversationId", "spaceId");
CREATE INDEX CONCURRENTLY "conversation_selected_spaces_wid_cid" ON "conversation_selected_spaces" ("workspaceId", "conversationId");
CREATE INDEX CONCURRENTLY "conversation_selected_spaces_conversation_id" ON "conversation_selected_spaces" ("conversationId");
CREATE INDEX CONCURRENTLY "conversation_selected_spaces_space_id" ON "conversation_selected_spaces" ("spaceId");
CREATE INDEX CONCURRENTLY "conversation_selected_spaces_selected_by_user_id" ON "conversation_selected_spaces" ("selectedByUserId");
