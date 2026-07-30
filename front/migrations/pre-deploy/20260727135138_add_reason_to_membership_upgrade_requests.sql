/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."membership_upgrade_requests" ADD COLUMN "reason" character varying(1024) COLLATE "pg_catalog"."default" DEFAULT NULL::character varying;
