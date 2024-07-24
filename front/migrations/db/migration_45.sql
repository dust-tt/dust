-- Migration created on Jul 24, 2024
CREATE TABLE IF NOT EXISTS "groups" (
    "id"  SERIAL , 
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, 
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, 
    "name" VARCHAR(255) NOT NULL, 
    "isWorkspace" BOOLEAN NOT NULL DEFAULT false, 
    "workspaceId" INTEGER NOT NULL REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE, 
    PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "groups_name" ON "groups" ("name");
