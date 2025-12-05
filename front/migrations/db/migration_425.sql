-- Migration created on Dec 04, 2025
CREATE TABLE IF NOT EXISTS "skill_configurations" (
    "createdAt"         TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"         TIMESTAMP WITH TIME ZONE NOT NULL,
    "version"           INTEGER                  NOT NULL,
    "status"            VARCHAR(255)             NOT NULL,
    "scope"             VARCHAR(255)             NOT NULL,
    "name"              TEXT                     NOT NULL,
    "description"       TEXT                     NOT NULL,
    "instructions"      TEXT                     NOT NULL,
    "requestedSpaceIds" BIGINT[]                 NOT NULL,
    "workspaceId"       BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id"                BIGSERIAL,
    "authorId"          BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

