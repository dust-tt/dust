-- Migration created on Oct 11, 2024
CREATE UNIQUE INDEX "webcrawler_pages_connector_id_document_id" ON "webcrawler_pages" ("connectorId", "documentId");