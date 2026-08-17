/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."run_usages" ADD COLUMN "usageState" character varying(255) COLLATE "pg_catalog"."default" DEFAULT 'reported'::character varying;

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."run_usages" ADD COLUMN "inferenceProvider" character varying(255) COLLATE "pg_catalog"."default" DEFAULT NULL::character varying;

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."run_usages" ADD COLUMN "region" character varying(255) COLLATE "pg_catalog"."default" DEFAULT NULL::character varying;
