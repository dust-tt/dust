/*
Post-deploy: drop the database-backed filesystem storage (`files.fileSystemNodeId` and the
`file_system_nodes`, `file_system_mutations` and `file_system_blob_cleanups` tables). This runs after
the code that read and wrote them is fully rolled out. Dropping `fileSystemNodeId` also drops
`files_file_system_node_id` and `files_fileSystemNodeId_fkey`, which must go before
`file_system_nodes`.
*/

/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."files" DROP COLUMN IF EXISTS "fileSystemNodeId";

/*
Statement 1
*/
SET SESSION lock_timeout = 3000;
DROP TABLE IF EXISTS "public"."file_system_blob_cleanups";

/*
Statement 2
*/
SET SESSION lock_timeout = 3000;
DROP TABLE IF EXISTS "public"."file_system_mutations";

/*
Statement 3
*/
SET SESSION lock_timeout = 3000;
DROP TABLE IF EXISTS "public"."file_system_nodes";
