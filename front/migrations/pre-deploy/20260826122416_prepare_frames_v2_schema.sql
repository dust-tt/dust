/*
Expand the sandbox function and sandbox owner schemas for Frames v2 while
legacy Pod Functions remain supported.
*/

/* Add the immutable publication identifier used by Frames v2 functions. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_functions"
  ADD COLUMN "publicationId" character varying(255) COLLATE "pg_catalog"."default";

/* Frames v2 functions are Frame-owned rather than Space-owned. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_functions"
  ALTER COLUMN "spaceId" DROP NOT NULL;

/* Replace the legacy one-function-per-file index with a plain FK index. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER INDEX "public"."sandbox_functions_file_id"
  RENAME TO "sandbox_functions_file_id_unique_legacy";

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY "sandbox_functions_file_id"
  ON "public"."sandbox_functions" USING btree ("fileId");

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY "public"."sandbox_functions_file_id_unique_legacy";

/* A Frame can publish several functions, with one row per name and publication. */
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY
  "sandbox_functions_workspace_id_file_id_publication_id_slug"
  ON "public"."sandbox_functions"
  USING btree ("workspaceId", "fileId", "publicationId", "slug");

/* Add Frame FileResource ownership to sandbox owners. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_owners"
  ADD COLUMN "frameFileModelId" bigint;

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_owners"
  ADD CONSTRAINT "sandbox_owners_frameFileModelId_fkey"
  FOREIGN KEY ("frameFileModelId") REFERENCES "public"."files" ("id")
  ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_owners"
  VALIDATE CONSTRAINT "sandbox_owners_frameFileModelId_fkey";

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY "sandbox_owners_frame_file_model_id_idx"
  ON "public"."sandbox_owners" USING btree ("frameFileModelId");

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY "sandbox_owners_workspace_frame_file_model_idx"
  ON "public"."sandbox_owners" USING btree ("workspaceId", "frameFileModelId")
  WHERE "frameFileModelId" IS NOT NULL;

/* Preserve exactly one owner while adding Frame ownership. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_owners"
  ADD CONSTRAINT "sandbox_owners_exactly_one_owner_v2_check"
  CHECK (num_nonnulls("conversationId", "spaceId", "frameFileModelId") = 1)
  NOT VALID;

SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_owners"
  VALIDATE CONSTRAINT "sandbox_owners_exactly_one_owner_v2_check";

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_owners"
  DROP CONSTRAINT "sandbox_owners_exactly_one_owner_check";

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_owners"
  RENAME CONSTRAINT "sandbox_owners_exactly_one_owner_v2_check"
  TO "sandbox_owners_exactly_one_owner_check";
