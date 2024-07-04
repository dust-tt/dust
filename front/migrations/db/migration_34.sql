-- Migration created on Jul 04, 2024
CREATE INDEX CONCURRENTLY "data_source_workspace_connector_provider" ON "data_sources" ("workspaceId", "connectorProvider");