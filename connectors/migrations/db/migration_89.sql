-- Migration created on Aug 05, 2025
CREATE TABLE IF NOT EXISTS "confluence_folders" ("createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "lastVisitedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "version" INTEGER NOT NULL, "skipReason" VARCHAR(255), "parentId" VARCHAR(255) DEFAULT NULL, "parentType" VARCHAR(255) DEFAULT NULL, "folderId" VARCHAR(255) NOT NULL, "spaceId" VARCHAR(255) NOT NULL, "title" TEXT NOT NULL, "externalUrl" VARCHAR(255) NOT NULL, "connectorId" BIGINT NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, "id"  BIGSERIAL , PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "confluence_folders_connector_id_folder_id" ON "confluence_folders" ("connectorId", "folderId");
CREATE INDEX "confluence_folders_connector_id_space_id_parent_id" ON "confluence_folders" ("connectorId", "spaceId", "parentId");
CREATE INDEX "confluence_folders_connector_id_last_visited_at" ON "confluence_folders" ("connectorId", "lastVisitedAt");

ALTER TABLE "public"."confluence_pages" ADD COLUMN "parentType" VARCHAR(255) DEFAULT NULL;