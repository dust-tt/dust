/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_functions" ADD COLUMN "userIdentity" character varying(64) COLLATE "pg_catalog"."default";
