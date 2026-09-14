/*
Record which of a skill's requested spaces were picked by hand under "Data and access", so they can
be kept when nothing in the skill requires them any more. The column is a subset of
"requestedSpaceIds", which stays the single source of truth for access checks.
*/

/* Empty default: old code ignores the column, new code treats [] as "no manual spaces". */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_configurations"
  ADD COLUMN "manuallyRequestedSpaceIds" bigint[] DEFAULT ARRAY[]::bigint[] NOT NULL;

/* Versions carry the same provenance so history and rollbacks stay consistent. */
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."skill_versions"
  ADD COLUMN "manuallyRequestedSpaceIds" bigint[] DEFAULT ARRAY[]::bigint[] NOT NULL;
