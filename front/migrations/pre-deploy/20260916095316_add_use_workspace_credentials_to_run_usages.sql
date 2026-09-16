/*
`run_usages` is one of the largest tables, so the column ships NOT NULL with a default rather than
nullable: since PostgreSQL 11 `ADD COLUMN ... DEFAULT ... NOT NULL` is a catalog-only change, so
every existing row reads false without a table rewrite. That default is also what makes this safe
pre-deploy — rows inserted by the currently deployed code, which does not know the column, land on
false, the correct value for every workspace except the one fixed by
`20260916_backfill_byok_run_usages.ts`.
*/

/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."run_usages" ADD COLUMN "useWorkspaceCredentials" boolean DEFAULT false NOT NULL;
