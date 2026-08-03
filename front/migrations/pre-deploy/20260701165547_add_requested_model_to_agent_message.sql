/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_messages" ADD COLUMN "requestedProviderId" character varying(255) COLLATE "pg_catalog"."default" DEFAULT NULL::character varying;

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_messages" ADD COLUMN "requestedModelId" character varying(255) COLLATE "pg_catalog"."default" DEFAULT NULL::character varying;

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_messages" ADD COLUMN "requestedReasoningEffort" character varying(255) COLLATE "pg_catalog"."default" DEFAULT NULL::character varying;
