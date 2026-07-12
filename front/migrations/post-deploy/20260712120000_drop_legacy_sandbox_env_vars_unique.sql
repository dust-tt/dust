/*
Statement 0

Drops the legacy full unique on (workspaceId, name), superseded by the two
partial per-scope uniques created pre-deploy
(sandbox_env_vars_workspace_scope_name_idx / sandbox_env_vars_pod_scope_name_idx).
Post-deploy on purpose: the deploy this migration belongs to ships
scope-aware queries whose predicates match the partial indexes; the legacy
index must survive until that code is live so older pods' (workspaceId, name)
lookups stay indexed. Once dropped, a pod-scoped row may shadow a
workspace-scoped name — which the pod-wins merge requires.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY "public"."workspace_sandbox_env_vars_workspace_name_idx";
