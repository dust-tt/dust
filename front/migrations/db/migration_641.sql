-- Migration created on May 18, 2026
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_message_feedbacks_conversation_id"
  ON "public"."agent_message_feedbacks" ("conversationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_step_content_tool_executions_conversation_id"
  ON "public"."agent_step_content_tool_executions" ("conversationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_step_content_tool_executions_step_content_id"
  ON "public"."agent_step_content_tool_executions" ("stepContentId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "agent_suggestions_conversation_id"
  ON "public"."agent_suggestions" ("conversationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "conversation_branches_conversation_id"
  ON "public"."conversation_branches" ("conversationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "conversation_participants_conversation_id"
  ON "public"."conversation_participants" ("conversationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "messages_conversation_id"
  ON "public"."messages" ("conversationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_conversation_reads_conversation_id"
  ON "public"."user_conversation_reads" ("conversationId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "wake_ups_conversation_id"
  ON "public"."wake_ups" ("conversationId");
