/*
Post-deploy: sweep any triggers still holding a legacy "executionMode".

Identical to the pre-deploy rename. Rows can only reach here if an old pod
created or updated a trigger between the pre-deploy migration and the end of the
rollout, so they are all fair_use or NULL, both of which map to user_pool.

The NOT NULL constraint lands in a follow-up PR, once this has run and
`SELECT "executionMode", count(*) FROM triggers GROUP BY 1` returns nothing but
the two pool values.
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
