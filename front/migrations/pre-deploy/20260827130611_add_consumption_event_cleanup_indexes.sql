SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY agent_message_consumption_events_processed_created_at ON public.agent_message_consumption_events USING btree ("createdAt", id) WHERE ("processedAt" IS NOT NULL);

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY agent_message_consumption_events_pending_by_id ON public.agent_message_consumption_events USING btree (id, "workspaceId", "runKey") WHERE ("processedAt" IS NULL);
