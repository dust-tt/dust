-- Migration created on Oct 23, 2025
CREATE INDEX CONCURRENTLY "microsoft_nodes_connector_id_id" ON "microsoft_nodes" ("connectorId", "id");
