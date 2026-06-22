/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."conversation_plans_id_seq"
	AS bigint
	INCREMENT BY 1
	MINVALUE 1 MAXVALUE 9223372036854775807
	START WITH 1 CACHE 1 NO CYCLE
;

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE TABLE "public"."conversation_plans" (
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"conversationId" bigint NOT NULL,
	"approvedAt" timestamp with time zone,
	"workspaceId" bigint NOT NULL,
	"id" bigint DEFAULT nextval('conversation_plans_id_seq'::regclass) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"approvedVersion" integer,
	"isClosed" boolean DEFAULT false NOT NULL,
	"approvedByUserId" character varying(255) COLLATE "pg_catalog"."default" DEFAULT NULL::character varying
);

/*
Statement 2
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY conversation_plans_pkey ON public.conversation_plans USING btree (id);

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."conversation_plans" ADD CONSTRAINT "conversation_plans_pkey" PRIMARY KEY USING INDEX "conversation_plans_pkey";

/*
Statement 4
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY conversation_plans_active_unique ON public.conversation_plans USING btree ("workspaceId", "conversationId") WHERE ("isClosed" = false);

/*
Statement 5
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY conversation_plans_conversation_id ON public.conversation_plans USING btree ("conversationId");

/*
Statement 6
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."conversation_plans_id_seq" OWNED BY "public"."conversation_plans"."id";

/*
Statement 7
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."conversation_plans" ADD CONSTRAINT "conversation_plans_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES conversations(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 8
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."conversation_plans" VALIDATE CONSTRAINT "conversation_plans_conversationId_fkey";

/*
Statement 9
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."conversation_plans" ADD CONSTRAINT "conversation_plans_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 10
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."conversation_plans" VALIDATE CONSTRAINT "conversation_plans_workspaceId_fkey";
