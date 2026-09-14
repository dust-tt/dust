/*
Post-deploy: make `sandbox_functions."publicationId"` NOT NULL.

Every function row belongs to a Frame publication — `createForFramePublication` is the only writer
and always sets one. The column was nullable for Pod functions, which no longer exist; production
holds no row without a publication (10,972 rows US, 25 EU, zero NULL in either).

`SET NOT NULL` scans the table under an ACCESS EXCLUSIVE lock. At this size that is a few
milliseconds, well inside the statement timeout below.
*/

/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_functions" ALTER COLUMN "publicationId" SET NOT NULL;
