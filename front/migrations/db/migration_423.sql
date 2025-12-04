CREATE TABLE IF NOT EXISTS "skill_configurations" (
    "id"                BIGSERIAL,
    "workspaceId"       BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "createdAt"         TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"         TIMESTAMP WITH TIME ZONE NOT NULL,
    "version"           INTEGER                  NOT NULL,
    "status"            VARCHAR(255)             NOT NULL,
    "scope"             VARCHAR(255)             NOT NULL,
    "name"              TEXT                     NOT NULL,
    "description"       TEXT                     NOT NULL,
    "instructions"      TEXT                     NOT NULL,
    "authorId"          BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "editorGroupId"     BIGINT REFERENCES "groups" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "requestedSpaceIds" BIGINT[]                 NOT NULL
);
