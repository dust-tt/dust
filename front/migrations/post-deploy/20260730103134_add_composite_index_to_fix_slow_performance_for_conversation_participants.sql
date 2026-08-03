SET
  SESSION statement_timeout = 1200000;

SET
  SESSION lock_timeout = 3000;

CREATE INDEX CONCURRENTLY IF NOT EXISTS conversation_participants_workspace_conversation_action_idx ON public.conversation_participants USING btree ("workspaceId", "conversationId", "actionRequired");