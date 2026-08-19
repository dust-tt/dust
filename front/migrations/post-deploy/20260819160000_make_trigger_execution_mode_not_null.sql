/*
Post-deploy: make triggers."executionMode" NOT NULL.

Every writer has been setting a pool value since the previous deploy, and the
sweep migration that shipped with it rewrote the legacy rows. Run this only once
`SELECT "executionMode", count(*) FROM triggers GROUP BY 1` returns nothing but
user_pool and workspace_pool.

No column default on purpose: charging a trigger to the wrong pool is a billing
bug, so every creation site states the pool explicitly and the compiler enforces
it through CreationAttributes<TriggerModel>.
 */
SET SESSION statement_timeout = 60000;
SET SESSION lock_timeout = 3000;

ALTER TABLE "public"."triggers"
    ALTER COLUMN "executionMode" SET NOT NULL;
