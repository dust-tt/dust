-- Migration created on Oct 21, 2024
CREATE TABLE
    IF NOT EXISTS "zendesk_configurations" (
        "id" SERIAL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "subdomain" VARCHAR(255) NOT NULL,
        "conversationsSlidingWindow" INTEGER NOT NULL DEFAULT 90,
        "connectorId" INTEGER NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX "zendesk_configurations_connector_id" ON "zendesk_configurations" ("connectorId");