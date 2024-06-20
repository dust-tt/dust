-- Migration created on Jun 20, 2024
CREATE INDEX CONCURRENTLY "user_messages_user_context_origin" ON "user_messages" ("userContextOrigin");
