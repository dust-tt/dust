/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_functions" ADD COLUMN "defaultStake" character varying(16) COLLATE "pg_catalog"."default" NOT NULL DEFAULT 'low';
