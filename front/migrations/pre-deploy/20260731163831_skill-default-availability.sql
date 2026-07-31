/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_configurations" ALTER COLUMN "availability" SET DEFAULT 'editors'::character varying;

