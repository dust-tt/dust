/*
Statement 1
  - DELETES_DATA: Deletes all values in the column
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."feature_flags"
    DROP COLUMN "groupIds";
