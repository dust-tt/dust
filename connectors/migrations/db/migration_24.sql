-- Migration created on Oct 11, 2024
CREATE UNIQUE INDEX CONCURRENTLY "webcrawler_pages_connector_id_document_id" ON "webcrawler_pages" ("connectorId", "documentId");

CREATE UNIQUE INDEX CONCURRENTLY "webcrawler_folders_connector_id_internal_id" ON "webcrawler_folders" ("connectorId", "internalId");