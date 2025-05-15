-- Migration created on May 14, 2025
CREATE INDEX CONCURRENTLY "content_fragments_workspace_id_s_id_version" ON "content_fragments" ("workspaceId", "sId", "version");
