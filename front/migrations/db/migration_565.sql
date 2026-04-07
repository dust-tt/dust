-- Migration created on Apr 07, 2026
CREATE TABLE IF NOT EXISTS "skill_suggestions" (
    "id" BIGSERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "skillConfigurationId" BIGINT NOT NULL REFERENCES "skill_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "skillVersionId" BIGINT NOT NULL REFERENCES "skill_versions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "kind" VARCHAR(255) NOT NULL,
    "suggestion" JSONB NOT NULL,
    "analysis" TEXT,
    "state" VARCHAR(255) NOT NULL DEFAULT 'pending',
    "source" VARCHAR(255) NOT NULL,
    "sourceConversationId" BIGINT REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "groupId" VARCHAR(255)
);
COMMENT ON TABLE "skill_suggestions" IS 'AI-generated suggestions to improve skill configurations.';
COMMENT ON COLUMN "skill_suggestions"."skillConfigurationId" IS 'Skill configuration this suggestion applies to (including suggested-status rows for creates).';
COMMENT ON COLUMN "skill_suggestions"."skillVersionId" IS 'Skill version row this suggestion was generated from.';
COMMENT ON COLUMN "skill_suggestions"."kind" IS 'Discriminator for the suggestion type';
COMMENT ON COLUMN "skill_suggestions"."suggestion" IS 'JSONB payload; structure depends on kind.';
COMMENT ON COLUMN "skill_suggestions"."analysis" IS 'Optional reasoning for why the suggestion was made.';
COMMENT ON COLUMN "skill_suggestions"."source" IS 'Origin of the suggestion ';
COMMENT ON COLUMN "skill_suggestions"."state" IS 'Lifecycle state';
COMMENT ON COLUMN "skill_suggestions"."sourceConversationId" IS 'Conversation that triggered this suggestion when applicable';
COMMENT ON COLUMN "skill_suggestions"."groupId" IS 'Optional shared key for batched suggestions';

CREATE INDEX CONCURRENTLY "skill_suggestions_list_by_skill_configuration_idx"
    ON "skill_suggestions" ("workspaceId", "skillConfigurationId", "state", "kind");
CREATE INDEX CONCURRENTLY "idx_skill_suggestions_workspace_state"
    ON "skill_suggestions" ("workspaceId", "state");
CREATE INDEX CONCURRENTLY "skill_suggestions_workspace_skill_config_kind"
    ON "skill_suggestions" ("skillConfigurationId");
CREATE INDEX CONCURRENTLY "skill_suggestions_workspace_skill_version"
    ON "skill_suggestions" ("skillVersionId");
CREATE INDEX CONCURRENTLY "idx_skill_suggestions_group"
    ON "skill_suggestions" ("groupId")
    WHERE "groupId" IS NOT NULL;
