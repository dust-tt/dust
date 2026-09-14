/*
Pre-deploy: rename triggers."executionMode" from fair_use/programmatic to the
pool-based user_pool/workspace_pool.

Runs before the code that writes the new values is live, on purpose. The
currently deployed code already reads both vocabularies through
getTriggerExecutionMode, so converting early is a no-op behaviourally, and it
means the programmatic rows are already correct when the new code takes over.
Leaving them for the post-deploy sweep would gate them against the user pool
instead of the workspace pool for the length of the deploy.

NULL means "never set", which the code has always treated as fair use.

A post-deploy sweep re-runs this to catch rows written by old pods during the
rollout.
 */
SET SESSION statement_timeout = 60000;
SET SESSION lock_timeout = 3000;

UPDATE "public"."triggers"
SET "executionMode" = CASE
                          WHEN "executionMode" = 'programmatic' THEN 'workspace_pool'
                          ELSE 'user_pool'
                          END
WHERE "executionMode" IS NULL
   OR "executionMode" IN ('fair_use', 'programmatic');
