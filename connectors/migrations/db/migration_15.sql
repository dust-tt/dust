-- Migration created on Sep 25, 2024
CREATE TABLE IF NOT EXISTS "snowflake_configurations" (
    "id"  SERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "connectorId" INTEGER NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "snowflake_configurations_connector_id" ON "snowflake_configurations" ("connectorId");
