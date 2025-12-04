CREATE TABLE IF NOT EXISTS "skill_configurations" (
    "id"                BIGSERIAL PRIMARY KEY,
    "workspaceId"       BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "createdAt"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "version"           INTEGER                  NOT NULL DEFAULT 0,
    "status"            VARCHAR(255)             NOT NULL DEFAULT 'active',
    "scope"             VARCHAR(255)             NOT NULL DEFAULT 'private',
    "name"              TEXT                     NOT NULL,
    "description"       TEXT                     NOT NULL,
    "instructions"      TEXT                     NOT NULL,
    "authorId"          BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "editorGroupId"     BIGINT REFERENCES "groups" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "requestedSpaceIds" BIGINT[]                 NOT NULL DEFAULT '{}'
);
