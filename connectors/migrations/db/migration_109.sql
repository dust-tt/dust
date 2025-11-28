-- Migration created on Nov 04, 2025
CREATE TABLE IF NOT EXISTS "databricks_configurations" (
    "id"  SERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "connectorId" INTEGER NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "databricks_configurations_connector_id" ON "databricks_configurations" ("connectorId");