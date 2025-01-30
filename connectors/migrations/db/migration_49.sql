-- Migration created on Jan 29, 2025
CREATE TABLE IF NOT EXISTS "bigquery_configurations" (
    "id"  SERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "connectorId" INTEGER NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "bigquery_configurations_connector_id" ON "bigquery_configurations" ("connectorId");
