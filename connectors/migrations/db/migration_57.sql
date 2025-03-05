-- Migration created on Mar 05, 2025
CREATE TABLE IF NOT EXISTS "gong_configurations"
(
    "createdAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"       TIMESTAMP WITH TIME ZONE NOT NULL,
    "timestampCursor" BIGINT,
    "connectorId"     BIGINT                   NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"              BIGSERIAL,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gong_configurations_connector_id" ON "gong_configurations" ("connectorId");
