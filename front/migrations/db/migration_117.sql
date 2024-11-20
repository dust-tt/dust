-- Migration created on Nov 20, 2024
CREATE TABLE IF NOT EXISTS "agent_conversation_include_file_actions" (
    "id" SERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "fileId" VARCHAR(255) NOT NULL,
    "functionCallId" VARCHAR(255),
    "functionCallName" VARCHAR(255),
    "step" INTEGER NOT NULL,
    "agentMessageId" INTEGER NOT NULL REFERENCES "agent_messages" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX CONCURRENTLY "agent_conversation_include_file_actions_agent_message_id" ON "agent_conversation_include_file_actions" ("agentMessageId");