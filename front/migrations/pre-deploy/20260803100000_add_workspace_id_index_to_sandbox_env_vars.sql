/*
Statement 0

Workspace scrub deletes by bare "workspaceId", which neither per-scope
partial unique can serve (the predicate implies neither "spaceId"
condition). This plain index keeps the workspace FK covered once the
legacy full unique on ("workspaceId", name) is dropped post-deploy
(20260712120000_drop_legacy_sandbox_env_vars_unique.sql).

Long timeout on purpose: CREATE INDEX CONCURRENTLY waits out concurrent
transactions.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE INDEX CONCURRENTLY "sandbox_env_vars_workspace_id_idx" ON "public"."workspace_sandbox_env_vars" USING btree ("workspaceId");
