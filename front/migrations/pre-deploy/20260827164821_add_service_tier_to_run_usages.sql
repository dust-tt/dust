/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."run_usages" ADD COLUMN "serviceTier" character varying(255) COLLATE "pg_catalog"."default" NOT NULL DEFAULT 'default'::character varying;
