CREATE TABLE IF NOT EXISTS "public"."salesforce_configurations" (
  "id" BIGSERIAL,
  "connectorId" INTEGER NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "salesforce_configurations_connector_id" ON "public"."salesforce_configurations" ("connectorId"); 