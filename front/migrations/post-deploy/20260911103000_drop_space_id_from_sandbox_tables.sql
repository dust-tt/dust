/*
Post-deploy: drop the dead `spaceId` columns on `sandbox_functions` and `sandbox_owners`.

Pod functions and pod-owned sandboxes no longer exist as owner kinds: functions are only ever
created for a Frame publication (`spaceId` written as NULL), and sandbox owners are conversations or
Frames. The legacy rows were scrubbed by `cleanup_pod_functions_and_sandboxes`, and both production
regions hold zero rows with a non-NULL `spaceId`.

Dropping each column also drops the indexes and foreign keys built on it. The two unique indexes on
`sandbox_functions` were already inert — Postgres treats NULLs as distinct, so they enforced nothing
once every row had `spaceId` NULL. Uniqueness for Frame functions comes from
`(workspaceId, fileId, publicationId, slug)`.
*/

/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_functions" DROP COLUMN IF EXISTS "spaceId";

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."sandbox_owners" DROP COLUMN IF EXISTS "spaceId";
