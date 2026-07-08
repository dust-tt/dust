/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."keys" ADD COLUMN "monthlyCapAwuCredits" integer;

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."keys" ADD COLUMN "creditState" character varying(255) NOT NULL DEFAULT 'on_pool'::character varying;
