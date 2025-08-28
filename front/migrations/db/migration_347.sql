-- Migration created on Aug 27, 2025
CREATE TABLE
    IF NOT EXISTS "trigger_subscribers" (
        "createdAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "updatedAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "triggerId" BIGINT NOT NULL REFERENCES "triggers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "userId" BIGINT NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "id" BIGSERIAL,
            PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX "trigger_subscribers_workspace_id_trigger_id_user_id" ON "trigger_subscribers" ("workspaceId", "triggerId", "userId");