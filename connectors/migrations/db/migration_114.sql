-- Migration created on Jan 12, 2026
CREATE TABLE
    IF NOT EXISTS "dust_project_configurations" (
        "createdAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "updatedAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "projectId" VARCHAR(255) NOT NULL UNIQUE,
            "lastSyncedAt" TIMESTAMP
        WITH
            TIME ZONE,
            "connectorId" BIGINT NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "id" BIGSERIAL,
            PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX "dust_project_configurations_connector_id" ON "dust_project_configurations" ("connectorId");

CREATE UNIQUE INDEX "dust_project_configurations_project_id" ON "dust_project_configurations" ("projectId");

CREATE TABLE
    IF NOT EXISTS "dust_project_conversations" (
        "createdAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "updatedAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "conversationId" VARCHAR(255) NOT NULL UNIQUE,
            "projectId" VARCHAR(255) NOT NULL,
            "lastSyncedAt" TIMESTAMP
        WITH
            TIME ZONE,
            "lastMessageAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "connectorId" BIGINT NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "id" BIGSERIAL,
            PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX "dust_project_conversations_conversation_id" ON "dust_project_conversations" ("conversationId");

CREATE UNIQUE INDEX "dust_project_conversations_connector_id_conversation_id" ON "dust_project_conversations" ("connectorId", "conversationId");

CREATE INDEX "dust_project_conversations_connector_id_last_message_at" ON "dust_project_conversations" ("connectorId", "lastMessageAt");

CREATE INDEX "dust_project_conversations_connector_id_project_id_conversation" ON "dust_project_conversations" ("connectorId", "projectId", "conversationId");