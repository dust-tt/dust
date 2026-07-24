/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."conversation_participants" ADD COLUMN "conversationUpdatedAt" timestamp with time zone;

/*
Statement 1
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY conversation_participants_wid_uid_conv_updated_at ON public.conversation_participants USING btree ("workspaceId", "userId", "conversationUpdatedAt");
