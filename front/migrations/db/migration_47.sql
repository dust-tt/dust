-- Migration created on Jul 25, 2024
CREATE TABLE IF NOT EXISTS "group_memberships" (
    "id"  SERIAL , 
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, 
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, 
    "startAt" TIMESTAMP WITH TIME ZONE NOT NULL, 
    "endAt" TIMESTAMP WITH TIME ZONE, 
    "userId" INTEGER NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, 
    "groupId" INTEGER NOT NULL REFERENCES "groups" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId" INTEGER NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, 
    PRIMARY KEY ("id")
    );
CREATE INDEX "group_memberships_user_id_group_id" ON "group_memberships" ("userId", "groupId");
