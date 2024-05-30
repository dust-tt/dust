-- Migration created on May 30, 2024
CREATE TABLE IF NOT EXISTS "scheduled_agents" (
    "id" SERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "sId" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "userId" INTEGER REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "agentConfigurationId" VARCHAR(255) NOT NULL,
    "prompt" VARCHAR(255),
    "timeOfDay" VARCHAR(255) NOT NULL,
    "timeZone" VARCHAR(255) NOT NULL,
    "scheduleType" VARCHAR(255) NOT NULL,
    "weeklyDaysOfWeek" INTEGER [],
    "monthlyFirstLast" VARCHAR(255),
    "monthlyDayOfWeek" INTEGER,
    "emails" VARCHAR(255) [],
    "slackChannelId" VARCHAR(255),
    "workspaceId" INTEGER REFERENCES "workspaces" ("id") ON DELETE
    SET
        NULL ON UPDATE CASCADE,
        PRIMARY KEY ("id")
);

CREATE INDEX "scheduled_agents_user_id" ON "scheduled_agents" ("userId");

CREATE INDEX "scheduled_agents_agent_configuration_id" ON "scheduled_agents" ("agentConfigurationId");

CREATE INDEX "scheduled_agents_workspace_id" ON "scheduled_agents" ("workspaceId");