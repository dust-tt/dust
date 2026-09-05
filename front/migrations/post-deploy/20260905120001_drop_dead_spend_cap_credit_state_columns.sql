/*
Post-deploy: drop the dead spend-cap credit-state columns.

Per-API-key and programmatic spend caps are enforced from the Redis rate limiter
compared against DB-persisted cap values, so these columns are no longer read or
written — the spend-cap cleanup PR removed the model fields and all readers.
Safe once that code is fully deployed.

  keys."creditState"                  (per-API-key credit state)
  workspaces."programmaticCreditState"(workspace programmatic credit state)

`memberships.creditState` is NOT dropped — it still carries the seat↔pool
dimension (see the backfill migration).
*/

/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."keys" DROP COLUMN IF EXISTS "creditState";

/*
Statement 1
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."workspaces" DROP COLUMN IF EXISTS "programmaticCreditState";
