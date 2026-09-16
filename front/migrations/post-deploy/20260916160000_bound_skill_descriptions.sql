-- Deploy backend truncation, then run 20260916_truncate_skill_descriptions.ts
-- with --execute before narrowing these columns.
SET SESSION lock_timeout = 3000;
SET SESSION statement_timeout = 0;

ALTER TABLE "public"."skill_configurations"
    ALTER COLUMN "agentFacingDescription" TYPE VARCHAR(4096),
    ALTER COLUMN "userFacingDescription" TYPE VARCHAR(2048);

ALTER TABLE "public"."skill_versions"
    ALTER COLUMN "agentFacingDescription" TYPE VARCHAR(4096),
    ALTER COLUMN "userFacingDescription" TYPE VARCHAR(2048);
