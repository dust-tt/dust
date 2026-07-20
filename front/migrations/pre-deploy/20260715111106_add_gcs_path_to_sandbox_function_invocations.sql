/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_function_invocations" ADD COLUMN "gcsPath" text COLLATE "pg_catalog"."default";
