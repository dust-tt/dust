SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;

CREATE TABLE "public"."group_model_tiers"
(
  "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
  "tier"        VARCHAR(255)             NOT NULL,
  "workspaceId" BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "id"          BIGSERIAL,
  "groupId"     BIGINT                   NOT NULL REFERENCES "groups" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "group_model_tiers_workspace_group_unique"
  ON "group_model_tiers" ("workspaceId", "groupId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "group_model_tiers_group_id"
  ON "group_model_tiers" ("groupId");

CREATE TABLE "public"."user_model_tiers"
(
  "createdAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt"   TIMESTAMP WITH TIME ZONE NOT NULL,
  "tier"        VARCHAR(255)             NOT NULL,
  "workspaceId" BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "id"          BIGSERIAL,
  "userId"      BIGINT                   NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "user_model_tiers_workspace_user_unique"
  ON "user_model_tiers" ("workspaceId", "userId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_model_tiers_user_id"
  ON "user_model_tiers" ("userId");

ALTER TABLE "public"."workspaces"
  ADD COLUMN IF NOT EXISTS "defaultModelsTier" VARCHAR(255) DEFAULT NULL;
