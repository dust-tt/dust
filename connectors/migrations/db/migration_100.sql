-- Migration created on Oct 14, 2025
CREATE TABLE IF NOT EXISTS "microsoft_bot_messages" (
    "id" BIGSERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "connectorId" BIGINT NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "message" TEXT NOT NULL,
    "userId" VARCHAR(255) NOT NULL,
    "userAadObjectId" VARCHAR(255),
    "email" VARCHAR(255) NOT NULL,
    "userName" VARCHAR(255) NOT NULL,
    "conversationId" VARCHAR(255) NOT NULL,
    "activityId" VARCHAR(255) NOT NULL,
    "channelId" VARCHAR(255) NOT NULL,
    "replyToId" VARCHAR(255),
    "dustConversationId" VARCHAR(255),
    PRIMARY KEY ("id")
);

CREATE INDEX "microsoft_bot_messages_connector_id" ON "microsoft_bot_messages" ("connectorId");
CREATE INDEX "microsoft_bot_messages_connector_id_conversation_id" ON "microsoft_bot_messages" ("connectorId", "conversationId");
CREATE INDEX "microsoft_bot_messages_connector_id_user_id" ON "microsoft_bot_messages" ("connectorId", "userId");
CREATE INDEX "microsoft_bot_messages_connector_id_dust_conversation_id" ON "microsoft_bot_messages" ("connectorId", "dustConversationId");
