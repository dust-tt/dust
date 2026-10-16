-- Per-user consent to a Frame's required tools.call pairs.
-- authorizedTools is varchar(255)[][] matching frame_publications.requiredTools.

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;

CREATE TABLE IF NOT EXISTS "public"."frame_tool_authorizations" (
  "id" BIGSERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "workspaceId" BIGINT NOT NULL REFERENCES "public"."workspaces" ("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  "fileId" BIGINT NOT NULL REFERENCES "public"."files" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "userId" BIGINT NOT NULL REFERENCES "public"."users" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "authorizedTools" character varying(255)[][]
    COLLATE "pg_catalog"."default"
    DEFAULT ARRAY[]::character varying(255)[][]
    NOT NULL
);

SET SESSION statement_timeout = 0;
SET SESSION lock_timeout = 0;

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "frame_tool_authorizations_workspace_id_file_id_user_id"
  ON "public"."frame_tool_authorizations" ("workspaceId", "fileId", "userId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "frame_tool_authorizations_file_id"
  ON "public"."frame_tool_authorizations" ("fileId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "frame_tool_authorizations_user_id"
  ON "public"."frame_tool_authorizations" ("userId");
