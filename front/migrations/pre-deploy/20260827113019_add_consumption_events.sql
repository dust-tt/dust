SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."agent_message_consumption_events_id_seq"
	AS bigint
	INCREMENT BY 1
	MINVALUE 1 MAXVALUE 9223372036854775807
	START WITH 1 CACHE 1 NO CYCLE
;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE TABLE "public"."agent_message_consumption_events" (
	"createdAt" timestamp with time zone NOT NULL,
	"processedAt" timestamp with time zone,
	"updatedAt" timestamp with time zone NOT NULL,
	"agentMessageId" bigint NOT NULL,
	"workspaceId" bigint NOT NULL,
	"id" bigint DEFAULT nextval('agent_message_consumption_events_id_seq'::regclass) NOT NULL,
	"subagentAgentMessageId" bigint,
	"runKey" character varying(64) COLLATE "pg_catalog"."default" NOT NULL,
	"rootAgentMessageId" character varying(255) COLLATE "pg_catalog"."default" NOT NULL,
	"eventKey" character varying(255) COLLATE "pg_catalog"."default" NOT NULL,
	"kind" character varying(32) COLLATE "pg_catalog"."default" NOT NULL,
	"consumptionItemIds" bigint[],
	"status" character varying(32) COLLATE "pg_catalog"."default"
);

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY agent_message_consumption_events_pkey ON public.agent_message_consumption_events USING btree (id);

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_message_consumption_events" ADD CONSTRAINT "agent_message_consumption_events_pkey" PRIMARY KEY USING INDEX "agent_message_consumption_events_pkey";

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY agent_message_consumption_events_workspace_message_id ON public.agent_message_consumption_events USING btree ("workspaceId", "agentMessageId", id);

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY agent_message_consumption_events_workspace_event_key ON public.agent_message_consumption_events USING btree ("workspaceId", "eventKey");

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY agent_message_consumption_events_pending_by_run_key ON public.agent_message_consumption_events USING btree ("workspaceId", "runKey", id) WHERE ("processedAt" IS NULL);

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."agent_message_consumption_events_id_seq" OWNED BY "public"."agent_message_consumption_events"."id";
