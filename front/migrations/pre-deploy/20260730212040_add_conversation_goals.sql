/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
CREATE SEQUENCE "public"."conversation_goals_id_seq"
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
CREATE TABLE "public"."conversation_goals" (
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"terminalAt" timestamp with time zone,
	"workspaceId" bigint NOT NULL,
	"id" bigint DEFAULT nextval('conversation_goals_id_seq'::regclass) NOT NULL,
	"conversationId" bigint NOT NULL,
	"createdByUserId" bigint NOT NULL,
	"objective" text COLLATE "pg_catalog"."default" NOT NULL,
	"status" character varying(255) COLLATE "pg_catalog"."default" NOT NULL,
	"statusReason" text COLLATE "pg_catalog"."default"
);

/*
Statement 2
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY conversation_goals_pkey ON public.conversation_goals USING btree (id);

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."conversation_goals" ADD CONSTRAINT "conversation_goals_pkey" PRIMARY KEY USING INDEX "conversation_goals_pkey";

/*
Statement 4
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY conversation_goals_conversation_id ON public.conversation_goals USING btree ("conversationId");

/*
Statement 5
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY conversation_goals_created_by_user_id ON public.conversation_goals USING btree ("createdByUserId");

/*
Statement 6
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY conversation_goals_one_unfinished ON public.conversation_goals USING btree ("workspaceId", "conversationId") WHERE ((status)::text = ANY ((ARRAY['active'::character varying, 'paused'::character varying, 'blocked'::character varying])::text[]));

/*
Statement 7
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER SEQUENCE "public"."conversation_goals_id_seq" OWNED BY "public"."conversation_goals"."id";

/*
Statement 8
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."conversation_goals" ADD CONSTRAINT "conversation_goals_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES conversations(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 9
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."conversation_goals" VALIDATE CONSTRAINT "conversation_goals_conversationId_fkey";

/*
Statement 10
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."conversation_goals" ADD CONSTRAINT "conversation_goals_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 11
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."conversation_goals" VALIDATE CONSTRAINT "conversation_goals_createdByUserId_fkey";

/*
Statement 12
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."conversation_goals" ADD CONSTRAINT "conversation_goals_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES workspaces(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 13
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."conversation_goals" VALIDATE CONSTRAINT "conversation_goals_workspaceId_fkey";
