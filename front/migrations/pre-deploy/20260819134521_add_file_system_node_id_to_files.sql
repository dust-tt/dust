/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."files" ADD COLUMN "fileSystemNodeId" bigint;

/*
Statement 1
CREATE INDEX CONCURRENTLY cannot run inside a transaction, and the runner
applies this file through psql so the session settings above do not carry an
open transaction.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY files_file_system_node_id ON public.files USING btree ("fileSystemNodeId") WHERE ("fileSystemNodeId" IS NOT NULL);

/*
Statement 2
RESTRICT: a node cannot be removed while a file still points at it, so the
ordering is enforced here rather than left to callers.

NOT VALID then VALIDATE: the constraint applies to new rows immediately while
the validation scan takes only a light lock on this large table.
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."files" ADD CONSTRAINT "files_fileSystemNodeId_fkey" FOREIGN KEY ("fileSystemNodeId") REFERENCES file_system_nodes(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 3
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."files" VALIDATE CONSTRAINT "files_fileSystemNodeId_fkey";
