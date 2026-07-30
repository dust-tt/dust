/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_functions" ADD COLUMN "userIdentity" character varying(64) COLLATE "pg_catalog"."default";

SET SESSION statement_timeout = 1200000;
UPDATE "public"."sandbox_functions"
SET "userIdentity" = "authentication"
WHERE "authentication" IS NOT NULL;
