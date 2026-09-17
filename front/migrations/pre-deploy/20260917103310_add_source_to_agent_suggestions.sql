/*
`agent_suggestions` ships the column NOT NULL with a default rather than nullable: since
PostgreSQL 11 `ADD COLUMN ... DEFAULT ... NOT NULL` is a catalog-only change, so every existing
row reads 'sidekick' without a table rewrite. That default is also what makes this safe
pre-deploy — every suggestion created by the currently deployed code comes from the
AgentBuilderSidekick, so 'sidekick' is the correct value for every row inserted before the
follow-up PR that passes `source` explicitly at each call site.
*/

/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agent_suggestions" ADD COLUMN "source" character varying(255) DEFAULT 'sidekick' NOT NULL;
