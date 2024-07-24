-- Migration created on Jul 24, 2024
CREATE TABLE IF NOT EXISTS "groups" (
    "id"  SERIAL , 
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, 
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "name" VARCHAR(255) NOT NULL, 
    "type" VARCHAR(255) NOT NULL, 
    "workspaceId" INTEGER NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, 
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "groups_workspace_id_name" ON "groups" ("workspaceId", "name");
