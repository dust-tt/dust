/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_messages" ADD CONSTRAINT "pgschemadiff_tmpnn_5JTLBPZjRMmmX9XW6nSFUQ" CHECK("conversationId" IS NOT NULL) NOT VALID;

/*
Statement 1
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_messages" VALIDATE CONSTRAINT "pgschemadiff_tmpnn_5JTLBPZjRMmmX9XW6nSFUQ";

/*
Statement 2
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_messages" ALTER COLUMN "conversationId" SET NOT NULL;

/*
Statement 3
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_messages" DROP CONSTRAINT "pgschemadiff_tmpnn_5JTLBPZjRMmmX9XW6nSFUQ";

/*
Statement 4
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."compaction_messages" ADD CONSTRAINT "pgschemadiff_tmpnn_dxBZyYrZTz6JkvJfvVMo6g" CHECK("conversationId" IS NOT NULL) NOT VALID;

/*
Statement 5
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."compaction_messages" VALIDATE CONSTRAINT "pgschemadiff_tmpnn_dxBZyYrZTz6JkvJfvVMo6g";

/*
Statement 6
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."compaction_messages" ALTER COLUMN "conversationId" SET NOT NULL;

/*
Statement 7
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."compaction_messages" DROP CONSTRAINT "pgschemadiff_tmpnn_dxBZyYrZTz6JkvJfvVMo6g";

/*
Statement 8
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."user_messages" ADD CONSTRAINT "pgschemadiff_tmpnn_PE8l7znXStmJnOfPSRWfSA" CHECK("conversationId" IS NOT NULL) NOT VALID;

/*
Statement 9
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."user_messages" VALIDATE CONSTRAINT "pgschemadiff_tmpnn_PE8l7znXStmJnOfPSRWfSA";

/*
Statement 10
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."user_messages" ALTER COLUMN "conversationId" SET NOT NULL;

/*
Statement 11
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."user_messages" DROP CONSTRAINT "pgschemadiff_tmpnn_PE8l7znXStmJnOfPSRWfSA";

/*
Statement 12
  - INDEX_DROPPED: Dropping this index means queries that use this index might perform worse because they will no longer will be able to leverage it.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY "public"."agent_messages_id_conversation_id_null";

/*
Statement 13
  - INDEX_DROPPED: Dropping this index means queries that use this index might perform worse because they will no longer will be able to leverage it.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY "public"."compaction_messages_id_conversation_id_null";

/*
Statement 14
  - INDEX_DROPPED: Dropping this index means queries that use this index might perform worse because they will no longer will be able to leverage it.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY "public"."content_fragments_id_conversation_id_null";

/*
Statement 15
  - INDEX_DROPPED: Dropping this index means queries that use this index might perform worse because they will no longer will be able to leverage it.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY "public"."user_messages_id_conversation_id_null";
