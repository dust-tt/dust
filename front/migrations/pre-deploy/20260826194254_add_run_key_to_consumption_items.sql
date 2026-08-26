SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_message_consumption_items" ADD COLUMN "runKey" character varying(64) COLLATE "pg_catalog"."default";

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY agent_message_consumption_items_workspace_run_key ON public.agent_message_consumption_items USING btree ("workspaceId", "runKey");

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY agent_message_consumption_items_unique_rounding ON public.agent_message_consumption_items USING btree ("workspaceId", "agentMessageId", "attributionVersion", "runKey") WHERE ("itemType" = 'rounding'::text);
