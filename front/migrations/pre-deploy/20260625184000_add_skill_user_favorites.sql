-- Migration created on Jun 25, 2026
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE TABLE IF NOT EXISTS "skill_user_favorites" (
    "createdAt" timestamp WITH time zone NOT NULL DEFAULT NOW(),
    "updatedAt" timestamp WITH time zone NOT NULL DEFAULT NOW(),
    "userId" bigint NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "skillIds" varchar(255)[] NOT NULL DEFAULT ARRAY[]::varchar(255)[],
    "workspaceId" bigint NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id" bigserial,
    PRIMARY KEY ("id")
);

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "skill_user_favorites_workspace_user" ON "skill_user_favorites" ("workspaceId", "userId");

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "skill_user_favorites_user_id" ON "skill_user_favorites" ("userId");

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "skill_configurations" ADD COLUMN IF NOT EXISTS "favoriteCount" integer NOT NULL DEFAULT 0;
