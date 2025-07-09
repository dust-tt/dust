-- Migration created on Jun 09, 2025
CREATE TABLE IF NOT EXISTS "salesforce_synced_queries" ("createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "rootNodeName" TEXT NOT NULL, "soql" TEXT NOT NULL, "titleTemplate" TEXT NOT NULL, "contentTemplate" TEXT NOT NULL, "tagsTemplate" TEXT, "lastSeenModifiedDate" TIMESTAMP WITH TIME ZONE, "connectorId" BIGINT NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, "id"  BIGSERIAL , PRIMARY KEY ("id"));

CREATE INDEX "salesforce_synced_queries_connector_id" ON "salesforce_synced_queries" ("connectorId");
