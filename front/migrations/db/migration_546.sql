-- Migration created on Mar 19, 2026
CREATE TABLE
  IF NOT EXISTS "external_viewer_sessions" (
    "createdAt" TIMESTAMP
    WITH
      TIME ZONE NOT NULL,
      "updatedAt" TIMESTAMP
    WITH
      TIME ZONE NOT NULL,
      "sessionToken" UUID NOT NULL,
      "email" VARCHAR(255) NOT NULL,
      "expiresAt" TIMESTAMP
    WITH
      TIME ZONE NOT NULL,
      "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "id" BIGSERIAL,
      PRIMARY KEY ("id")
  );

CREATE UNIQUE INDEX "external_viewer_sessions_session_token" ON "external_viewer_sessions" ("sessionToken");

CREATE INDEX "external_viewer_sessions_workspace_id_email" ON "external_viewer_sessions" ("workspaceId", "email");