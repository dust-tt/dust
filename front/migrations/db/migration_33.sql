CREATE TABLE IF NOT EXISTS "agent_message_contents" (
    "id" SERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agentMessageId" INTEGER NOT NULL REFERENCES "agent_messages" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "step" INTEGER NOT NULL,
    "content" TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_message_contents_unique_agent_message_step" ON "agent_message_contents" ("agentMessageId", "step");