/*
Statement 0
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY compaction_messages_one_running_per_conversation ON public.compaction_messages USING btree ("workspaceId", "conversationId") WHERE ((status)::text = 'created'::text);
