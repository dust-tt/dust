/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."plans" ADD COLUMN "gateway" character varying(255) COLLATE "pg_catalog"."default" DEFAULT NULL::character varying;
