/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_message_consumption_items" ADD CONSTRAINT "pgschemadiff_tmpnn_E1Qf_yeWQc$aNSQs3s$I$w" CHECK("runUsageId" IS NOT NULL) NOT VALID;

/*
Statement 1
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_message_consumption_items" VALIDATE CONSTRAINT "pgschemadiff_tmpnn_E1Qf_yeWQc$aNSQs3s$I$w";

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_message_consumption_items" ALTER COLUMN "runUsageId" SET NOT NULL;

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_message_consumption_items" DROP CONSTRAINT "pgschemadiff_tmpnn_E1Qf_yeWQc$aNSQs3s$I$w";
