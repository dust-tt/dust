-- Migration created on Jan 20, 2026
CREATE TABLE IF NOT EXISTS "agent_suggestions" (
    "id" BIGSERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "agentConfigurationId" VARCHAR(255) NOT NULL,
    "agentConfigurationVersion" INTEGER NOT NULL,
    "kind" VARCHAR(255) NOT NULL,
    "suggestion" JSONB NOT NULL,
    "analysis" TEXT,
    "state" VARCHAR(255) NOT NULL,
    "source" VARCHAR(255) NOT NULL
);
COMMENT ON COLUMN "agent_suggestions"."agentConfigurationVersion" IS 'Version of the agent configuration when the suggestion was created';
COMMENT ON COLUMN "agent_suggestions"."kind" IS 'Discriminator for the suggestion type: instructions, tools, skills, model';
COMMENT ON COLUMN "agent_suggestions"."suggestion" IS 'JSONB payload containing the suggestion details, structure depends on kind';
COMMENT ON COLUMN "agent_suggestions"."analysis" IS 'Optional analysis/reasoning explaining why this suggestion was made';
COMMENT ON COLUMN "agent_suggestions"."source" IS 'Origin of the suggestion such as reinforcement or copilot';
COMMENT ON COLUMN "agent_suggestions"."state" IS 'Current state of the suggestion (e.g., pending, accepted, rejected...)';
COMMENT ON TABLE "agent_suggestions" IS 'AI-generated suggestions to improve agent configurations.';
CREATE INDEX CONCURRENTLY "agent_suggestions_workspace_agent_config" ON "agent_suggestions" ("workspaceId", "agentConfigurationId");
