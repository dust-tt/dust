-- Migration created on Dec 11, 2025
CREATE TABLE IF NOT EXISTS "conversation_skills" (
    "createdAt" timestamp WITH time zone NOT NULL,
    "updatedAt" timestamp WITH time zone NOT NULL,
    "agentConfigurationId" bigint NOT NULL REFERENCES "agent_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "customSkillId" bigint REFERENCES "skill_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "globalSkillId" varchar(255),
    "conversationId" bigint NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "source" varchar(255) NOT NULL,
    "addedByUserId" bigint REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "workspaceId" bigint NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id" bigserial,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversation_skills_wid_cid_acid" ON "conversation_skills" ("workspaceId", "conversationId", "agentConfigurationId");
CREATE INDEX "agent_message_skills_wid_cid_acid" ON "agent_message_skills" ("workspaceId", "conversationId", "agentConfigurationId");