/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."conversations" ADD COLUMN "clientRequestId" character varying(128) COLLATE "pg_catalog"."default" DEFAULT NULL::character varying;

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."messages" ADD COLUMN "clientRequestId" character varying(128) COLLATE "pg_catalog"."default" DEFAULT NULL::character varying;

/*
Statement 2
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY conversations_workspace_client_request_id ON public.conversations USING btree ("workspaceId", "clientRequestId") WHERE ("clientRequestId" IS NOT NULL);

/*
Statement 3
  - INDEX_BUILD: This might affect database performance. Concurrent index builds require a non-trivial amount of CPU, potentially affecting database performance. They also can take a while but do not lock out writes.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY messages_workspace_conversation_client_request_id ON public.messages USING btree ("workspaceId", "conversationId", "clientRequestId") WHERE ("clientRequestId" IS NOT NULL);
