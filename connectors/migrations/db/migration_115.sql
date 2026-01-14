-- Migration created on Jan 14, 2026
ALTER TABLE "public"."dust_project_conversations"
ADD COLUMN "sourceUpdatedAt" TIMESTAMP
WITH
    TIME ZONE;

ALTER TABLE "dust_project_conversations"
ALTER COLUMN "lastMessageAt"
DROP NOT NULL;

ALTER TABLE "dust_project_conversations"
ALTER COLUMN "lastMessageAt"
DROP DEFAULT;

ALTER TABLE "dust_project_conversations"
ALTER COLUMN "lastMessageAt" TYPE TIMESTAMP
WITH
    TIME ZONE;

UPDATE "dust_project_conversations"
SET
    "sourceUpdatedAt" = "lastMessageAt";

CREATE INDEX "dust_project_conversations_connector_id_source_updated_at" ON "dust_project_conversations" ("connectorId", "sourceUpdatedAt");