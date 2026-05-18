-- Migration created on May 07, 2026
CREATE TABLE IF NOT EXISTS "self_improving_skills_usage" (
  "id" BIGSERIAL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "skillId" BIGINT REFERENCES "skill_configurations" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "conversationId" BIGINT REFERENCES "conversations" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "priceMicroUsd" BIGINT NOT NULL,
  PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "self_improving_skills_usage_workspace_created_at_idx"
ON "self_improving_skills_usage" ("workspaceId", "createdAt");

CREATE INDEX IF NOT EXISTS "self_imp_skills_usage_workspace_skill_created_at_idx"
ON "self_improving_skills_usage" ("workspaceId", "skillId", "createdAt");

CREATE INDEX IF NOT EXISTS "self_improving_skills_usage_conversation_id_idx"
ON "self_improving_skills_usage" ("conversationId");