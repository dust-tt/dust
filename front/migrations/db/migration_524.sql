CREATE TABLE IF NOT EXISTS "conversation_butler_suggestions"
(
    "id"              BIGSERIAL PRIMARY KEY,
    "createdAt"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId"  BIGINT                   NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "sourceMessageId" BIGINT                   NOT NULL REFERENCES "messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "resultMessageId" BIGINT REFERENCES "messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "userId"          BIGINT REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "suggestionType"  VARCHAR(255)             NOT NULL,
    "metadata"        JSONB                    NOT NULL,
    "status"          VARCHAR(255)             NOT NULL DEFAULT 'pending',
    "workspaceId"     BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX CONCURRENTLY "conversation_butler_suggestions_ws_conv_status_idx"
    ON "conversation_butler_suggestions" ("workspaceId", "conversationId", "status");

CREATE INDEX CONCURRENTLY "conversation_butler_suggestions_source_message_idx"
    ON "conversation_butler_suggestions" ("sourceMessageId");

CREATE INDEX CONCURRENTLY "conversation_butler_suggestions_result_message_idx"
    ON "conversation_butler_suggestions" ("resultMessageId");

CREATE INDEX CONCURRENTLY "conversation_butler_suggestions_user_idx"
    ON "conversation_butler_suggestions" ("userId");