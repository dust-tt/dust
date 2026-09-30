/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."batch_suggestions" ADD COLUMN "updatedByUserId" bigint;

/*
Statement 1
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY batch_suggestions_updated_by_user_id ON public.batch_suggestions USING btree ("updatedByUserId") WHERE ("updatedByUserId" IS NOT NULL);

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."batch_suggestions" ADD CONSTRAINT "batch_suggestions_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;

/*
Statement 3
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."batch_suggestions" VALIDATE CONSTRAINT "batch_suggestions_updatedByUserId_fkey";
