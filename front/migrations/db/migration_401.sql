CREATE TABLE IF NOT EXISTS "onboarding_tasks" (
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "context" TEXT NOT NULL,
    "kind" VARCHAR(255) NOT NULL,
    "toolName" VARCHAR(255),
    "completedAt" TIMESTAMP WITH TIME ZONE,
    "skippedAt" TIMESTAMP WITH TIME ZONE,
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, "id"  BIGSERIAL , 
    "userId" BIGINT NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, 
    PRIMARY KEY ("id")
);
CREATE INDEX "onboarding_tasks_workspace_user" ON "onboarding_tasks" ("workspaceId", "userId");
