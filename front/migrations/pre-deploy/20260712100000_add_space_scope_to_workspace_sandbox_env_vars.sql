/*
Statement 0

Unifies sandbox env var scopes on one table: "spaceId" NULL = workspace
scope (all existing rows), set = pod scope (pods are project spaces).
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."workspace_sandbox_env_vars" ADD COLUMN "spaceId" bigint;

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."workspace_sandbox_env_vars" ADD CONSTRAINT "workspace_sandbox_env_vars_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES vaults(id) ON UPDATE CASCADE ON DELETE RESTRICT NOT VALID;

/*
Statement 2

Long timeout on purpose: validation scans existing rows.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."workspace_sandbox_env_vars" VALIDATE CONSTRAINT "workspace_sandbox_env_vars_spaceId_fkey";

/*
Statement 3

Index names use the sandbox_env_vars_ prefix on purpose: the table now
holds both scopes and workspace_ in its name is legacy.

Per-scope uniqueness. The legacy full unique (workspaceId, name) index is
intentionally KEPT for now: already-deployed queries filter without a
"spaceId" predicate and would lose index support if it were dropped here.
The resources PR swaps queries to be scope-aware and drops the legacy index
post-deploy. Until that drop, a pod row cannot shadow a workspace name in
prod — acceptable, pod writes are gated behind the resources PR.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY sandbox_env_vars_workspace_scope_name_idx ON public.workspace_sandbox_env_vars USING btree ("workspaceId", name) WHERE "spaceId" IS NULL;

/*
Statement 4

Also serves FK lookups on "spaceId" — an equality predicate implies the
partial condition.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY sandbox_env_vars_pod_scope_name_idx ON public.workspace_sandbox_env_vars USING btree ("spaceId", name) WHERE "spaceId" IS NOT NULL;

/*
Statement 5

User FKs are SET NULL on user deletion — without these indexes, scrubbing a
user would scan the table (BACK13). Pre-existing gap on this table.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY workspace_sandbox_env_vars_created_by_user_id ON public.workspace_sandbox_env_vars USING btree ("createdByUserId");

/*
Statement 6
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY workspace_sandbox_env_vars_last_updated_by_user_id ON public.workspace_sandbox_env_vars USING btree ("lastUpdatedByUserId");
