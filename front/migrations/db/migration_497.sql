-- Migration: Add API key tracking fields to user_messages table
-- These fields store the API key ID and auth method at message creation time
-- for analytics purposes, allowing accurate tracking without relying on the current auth context.

ALTER TABLE user_messages
ADD COLUMN "userContextApiKeyId" BIGINT NULL
  REFERENCES "keys" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE user_messages
ADD COLUMN "userContextAuthMethod" VARCHAR(50) NULL;

CREATE INDEX CONCURRENTLY "user_messages_userContextApiKeyId"
  ON "user_messages" ("userContextApiKeyId");
