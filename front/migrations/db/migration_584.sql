-- Migration created on avr. 13, 2026
CREATE TABLE IF NOT EXISTS "user_project_notification_preferences" ("createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "preference" VARCHAR(255) NOT NULL, "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, "id"  BIGSERIAL , "userId" BIGINT NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, "spaceId" BIGINT NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, PRIMARY KEY ("id"));
CREATE UNIQUE INDEX CONCURRENTLY "user_project_notif_pref_workspace_user_space_unique" ON "user_project_notification_preferences" ("workspaceId", "userId", "spaceId");
CREATE INDEX CONCURRENTLY "user_project_notification_preferences_user_id" ON "user_project_notification_preferences" ("userId");
CREATE INDEX CONCURRENTLY "user_project_notification_preferences_space_id" ON "user_project_notification_preferences" ("spaceId");
