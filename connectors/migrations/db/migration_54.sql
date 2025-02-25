-- Migration created on Feb 25, 2025
CREATE TABLE IF NOT EXISTS "remote_table_records" (
  "internalId" VARCHAR(255) NOT NULL,
  "tableInternalId" VARCHAR(255) NOT NULL, 
  "recordId" VARCHAR(255) NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "lastUpsertedAt" TIMESTAMP WITH TIME ZONE,
  "connectorId" BIGINT NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "id" BIGSERIAL,
  PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "remote_table_records_connector_id_internal_id" ON "remote_table_records" (
  "connectorId",
  "internalId"
);
