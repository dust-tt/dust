/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_configurations" ADD COLUMN "availability" character varying(255) COLLATE "pg_catalog"."default";

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_versions" ADD COLUMN "availability" character varying(255) COLLATE "pg_catalog"."default";
