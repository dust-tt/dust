CREATE TABLE IF NOT EXISTS "remote_databases" (
    "id"  SERIAL,
    "internalId" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "connectorId" INTEGER NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, 
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "remote_databases_connector_id_internal_id" ON "remote_databases" ("connectorId", "internalId");

CREATE TABLE IF NOT EXISTS "remote_schemas" (
    "id"  SERIAL,
    "internalId" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "database_name" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "connectorId" INTEGER NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "remote_schemas_connector_id_internal_id" ON "remote_schemas" ("connectorId", "internalId");

CREATE TABLE IF NOT EXISTS "remote_tables" (
    "id"  SERIAL,
    "internalId" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "database_name" VARCHAR(255) NOT NULL,
    "schema_name" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "connectorId" INTEGER NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "remote_tables_connector_id_internal_id" ON "remote_tables" ("connectorId", "internalId");
