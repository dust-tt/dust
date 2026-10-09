/*
Statement 0
  Existing rows are filled with the column default (`personal_limit`), which
  matches the historical meaning of every upgrade request before typed causes.
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."membership_upgrade_requests" ADD COLUMN "cause" character varying(32) COLLATE "pg_catalog"."default" NOT NULL DEFAULT 'personal_limit';
