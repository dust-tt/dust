/*
Add the nullable groupKind column to group_vaults. Existing rows can be backfilled after all
writers populate the column.
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."group_vaults"
  ADD COLUMN "groupKind" character varying(255) COLLATE "pg_catalog"."default";
