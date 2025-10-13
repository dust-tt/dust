-- Migration created on Aug 28, 2025
-- Create teams_messages table

CREATE TABLE "teams_messages" (
  "id" SERIAL PRIMARY KEY,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "connectorId" INTEGER NOT NULL,
  "message" TEXT NOT NULL,
  "userId" VARCHAR(255) NOT NULL,
  "userAadObjectId" VARCHAR(255),
  "email" VARCHAR(255) NOT NULL,
  "userName" VARCHAR(255) NOT NULL,
  "conversationId" VARCHAR(255) NOT NULL,
  "activityId" VARCHAR(255) NOT NULL,
  "channelId" VARCHAR(255) NOT NULL,
  "replyToId" VARCHAR(255),
  "dustConversationId" VARCHAR(255)
);

-- Add indexes
CREATE INDEX "teams_messages_connectorId_idx" ON "teams_messages" ("connectorId");
CREATE INDEX "teams_messages_conversationId_idx" ON "teams_messages" ("conversationId");
CREATE INDEX "teams_messages_userId_idx" ON "teams_messages" ("userId");
CREATE INDEX "teams_messages_dustConversationId_idx" ON "teams_messages" ("dustConversationId");

