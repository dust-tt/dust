-- Deploy backend truncation before narrowing these columns. Existing oversized descriptions
-- are truncated as part of the type conversion, including historical versions.
SET SESSION lock_timeout = 3000;
SET SESSION statement_timeout = 0;

ALTER TABLE "public"."skill_configurations"
    ALTER COLUMN "userFacingDescription" TYPE VARCHAR(2048)
    USING LEFT("userFacingDescription", 2048);

ALTER TABLE "public"."skill_versions"
    ALTER COLUMN "userFacingDescription" TYPE VARCHAR(2048)
    USING LEFT("userFacingDescription", 2048);
