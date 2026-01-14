-- Migration: Create project_metadata table
CREATE TABLE "project_metadata" (
    "id" SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "workspaceId" INTEGER NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "spaceId" INTEGER NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "description" TEXT,
    "urls" JSONB NOT NULL DEFAULT '[]',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "emoji" VARCHAR(255),
    "color" VARCHAR(255)
);

-- Unique constraint: one metadata per space (also provides efficient FK lookups per BACK13)
CREATE UNIQUE INDEX CONCURRENTLY "project_metadata_space_id_unique" ON "project_metadata" ("spaceId");
