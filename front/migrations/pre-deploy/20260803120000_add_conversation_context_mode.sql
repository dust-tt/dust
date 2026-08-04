/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_messages" ADD COLUMN "conversationContextMode" character varying(16) COLLATE "pg_catalog"."default";

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_messages" ADD COLUMN "contextIsolationRootRank" integer;

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."user_messages" ADD COLUMN "conversationContextMode" character varying(16) COLLATE "pg_catalog"."default";

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."wake_ups" ADD COLUMN "conversationContextMode" character varying(16) COLLATE "pg_catalog"."default" NOT NULL DEFAULT 'full'::character varying;
