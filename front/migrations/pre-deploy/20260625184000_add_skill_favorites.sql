-- Migration created on Jun 25, 2026
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE TABLE IF NOT EXISTS "skill_favorites" (
    "createdAt" timestamp WITH time zone NOT NULL DEFAULT NOW(),
    "updatedAt" timestamp WITH time zone NOT NULL DEFAULT NOW(),
    "userId" bigint NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "customSkillId" bigint REFERENCES "skill_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "globalSkillId" varchar(255),
    "workspaceId" bigint NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id" bigserial,
    PRIMARY KEY ("id"),
    CONSTRAINT "skill_favorites_exactly_one_skill" CHECK (
        (("customSkillId" IS NOT NULL)::int + ("globalSkillId" IS NOT NULL)::int) = 1
    )
);

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "skill_favorites_workspace_user_custom" ON "skill_favorites" ("workspaceId", "userId", "customSkillId") WHERE "customSkillId" IS NOT NULL;

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "skill_favorites_workspace_user_global" ON "skill_favorites" ("workspaceId", "userId", "globalSkillId") WHERE "globalSkillId" IS NOT NULL;

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "skill_favorites_user_id" ON "skill_favorites" ("userId");

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "skill_favorites_custom_skill_id" ON "skill_favorites" ("customSkillId") WHERE "customSkillId" IS NOT NULL;

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "skill_favorites_global_skill_id" ON "skill_favorites" ("globalSkillId") WHERE "globalSkillId" IS NOT NULL;
