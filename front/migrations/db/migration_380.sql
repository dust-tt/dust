-- Migration created on Oct 14, 2025
CREATE TABLE
    IF NOT EXISTS "webhook_requests" (
        "createdAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "updatedAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "status" VARCHAR(255) NOT NULL DEFAULT 'received',
            "webhookSourceId" BIGINT NOT NULL REFERENCES "webhook_sources" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
            "processedAt" TIMESTAMP
        WITH
            TIME ZONE,
            "errorMessage" TEXT,
            "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "id" BIGSERIAL,
            PRIMARY KEY ("id")
    );

CREATE INDEX "webhook_requests_workspace_id_webhook_source_id_status" ON "webhook_requests" ("workspaceId", "webhookSourceId", "status");

CREATE TABLE
    IF NOT EXISTS "webhook_request_triggers" (
        "createdAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "updatedAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "status" VARCHAR(255) NOT NULL DEFAULT 'not_matched',
            "webhookRequestId" BIGINT NOT NULL REFERENCES "webhook_requests" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
            "triggerId" BIGINT NOT NULL REFERENCES "triggers" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
            "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "id" BIGSERIAL,
            PRIMARY KEY ("id")
    );

CREATE INDEX "webhook_request_triggers_workspace_id_webhook_request_id_status" ON "webhook_request_triggers" ("workspaceId", "webhookRequestId", "status");

CREATE INDEX "webhook_request_triggers_workspace_id_trigger_id_status" ON "webhook_request_triggers" ("workspaceId", "triggerId", "status");

CREATE UNIQUE INDEX "webhook_request_triggers_webhook_request_id_trigger_id" ON "webhook_request_triggers" ("webhookRequestId", "triggerId");