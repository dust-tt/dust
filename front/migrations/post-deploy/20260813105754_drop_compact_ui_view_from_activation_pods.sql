/*
Statement 0
  - DELETES_DATA: Deletes all values in the column
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."activation_pods" DROP COLUMN "isCompactUIView";
