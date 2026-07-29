SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."agent_message_consumption_items_id_seq"
	AS bigint
	INCREMENT BY 1
	MINVALUE 1 MAXVALUE 9223372036854775807
	START WITH 1 CACHE 1 NO CYCLE
;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE TABLE "public"."agent_message_consumption_items" (
	"id" bigint DEFAULT nextval('agent_message_consumption_items_id_seq'::regclass) NOT NULL,
	"workspaceId" bigint NOT NULL,
	"conversationId" bigint NOT NULL,
	"agentMessageId" bigint NOT NULL,
	"runUsageId" bigint,
	"agentMCPActionId" bigint,
	"itemKey" character varying(256) COLLATE "pg_catalog"."default" NOT NULL,
	"itemType" character varying(32) COLLATE "pg_catalog"."default" NOT NULL,
	"attributionVersion" integer NOT NULL,
	"inputTokensCount" integer,
	"outputTokensCount" integer,
	"grossAttributedCreditAmountMicro" bigint NOT NULL,
	"directCreditAmountMicro" bigint,
	"completedAt" timestamp with time zone,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "agent_message_consumption_items_type_check" CHECK ("itemType" IN ('system', 'input', 'output', 'reasoning', 'tool')),
	CONSTRAINT "agent_message_consumption_items_version_check" CHECK ("attributionVersion" >= 1),
	CONSTRAINT "agent_message_consumption_items_input_tokens_check" CHECK ("inputTokensCount" IS NULL OR "inputTokensCount" >= 0),
	CONSTRAINT "agent_message_consumption_items_output_tokens_check" CHECK ("outputTokensCount" IS NULL OR "outputTokensCount" >= 0),
	CONSTRAINT "agent_message_consumption_items_gross_credits_check" CHECK ("grossAttributedCreditAmountMicro" >= 0),
	CONSTRAINT "agent_message_consumption_items_direct_credits_check" CHECK ("directCreditAmountMicro" IS NULL OR "directCreditAmountMicro" >= 0),
	CONSTRAINT "agent_message_consumption_items_reference_shape_check" CHECK (("itemType" = 'tool' AND "agentMCPActionId" IS NOT NULL) OR ("itemType" <> 'tool' AND "runUsageId" IS NOT NULL AND "agentMCPActionId" IS NULL)),
	CONSTRAINT "agent_message_consumption_items_direct_shape_check" CHECK ("directCreditAmountMicro" IS NULL OR ("itemType" = 'tool' AND "grossAttributedCreditAmountMicro" >= "directCreditAmountMicro")),
	CONSTRAINT "agent_message_consumption_items_token_shape_check" CHECK (("itemType" IN ('system', 'input') AND "outputTokensCount" IS NULL) OR ("itemType" IN ('output', 'reasoning') AND "inputTokensCount" IS NULL) OR "itemType" = 'tool')
);

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY agent_message_consumption_items_pkey ON public.agent_message_consumption_items USING btree (id);

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_message_consumption_items" ADD CONSTRAINT "agent_message_consumption_items_pkey" PRIMARY KEY USING INDEX "agent_message_consumption_items_pkey";

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY agent_message_consumption_items_message_version_key ON public.agent_message_consumption_items USING btree ("workspaceId", "agentMessageId", "attributionVersion", "itemKey");

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY agent_message_consumption_items_conversation_message ON public.agent_message_consumption_items USING btree ("workspaceId", "conversationId", "agentMessageId");

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY agent_message_consumption_items_conversation_id ON public.agent_message_consumption_items USING btree ("conversationId");

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY agent_message_consumption_items_agent_message_id ON public.agent_message_consumption_items USING btree ("agentMessageId");

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY agent_message_consumption_items_run_usage_id ON public.agent_message_consumption_items USING btree ("runUsageId");

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY agent_message_consumption_items_agent_m_c_p_action_id ON public.agent_message_consumption_items USING btree ("agentMCPActionId");

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY agent_message_consumption_items_unique_action ON public.agent_message_consumption_items USING btree ("workspaceId", "attributionVersion", "agentMCPActionId") WHERE "agentMCPActionId" IS NOT NULL;

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY agent_message_consumption_items_unique_run_item_type ON public.agent_message_consumption_items USING btree ("workspaceId", "attributionVersion", "runUsageId", "itemType") WHERE "agentMCPActionId" IS NULL;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."agent_message_consumption_items_id_seq" OWNED BY "public"."agent_message_consumption_items"."id";

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_message_consumption_items" ADD CONSTRAINT "agent_message_consumption_items_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_message_consumption_items" VALIDATE CONSTRAINT "agent_message_consumption_items_workspaceId_fkey";

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_message_consumption_items" ADD CONSTRAINT "agent_message_consumption_items_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES conversations(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_message_consumption_items" VALIDATE CONSTRAINT "agent_message_consumption_items_conversationId_fkey";

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_message_consumption_items" ADD CONSTRAINT "agent_message_consumption_items_agentMessageId_fkey" FOREIGN KEY ("agentMessageId") REFERENCES agent_messages(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_message_consumption_items" VALIDATE CONSTRAINT "agent_message_consumption_items_agentMessageId_fkey";

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_message_consumption_items" ADD CONSTRAINT "agent_message_consumption_items_runUsageId_fkey" FOREIGN KEY ("runUsageId") REFERENCES run_usages(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_message_consumption_items" VALIDATE CONSTRAINT "agent_message_consumption_items_runUsageId_fkey";

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_message_consumption_items" ADD CONSTRAINT "agent_message_consumption_items_agentMCPActionId_fkey" FOREIGN KEY ("agentMCPActionId") REFERENCES agent_mcp_actions(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_message_consumption_items" VALIDATE CONSTRAINT "agent_message_consumption_items_agentMCPActionId_fkey";
