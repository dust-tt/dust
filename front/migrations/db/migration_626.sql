-- Migration created on May 06, 2026

-- Store the suffix only. Use LEFT rather than LIKE because "_" is a SQL
-- wildcard in LIKE patterns.
UPDATE "workspace_sandbox_env_vars"
SET "name" = substr("name", 5)
WHERE LEFT("name", 4) = 'DST_';

ALTER TABLE "workspace_sandbox_env_vars"
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'config',
  ADD COLUMN "placeholder_nonce" BYTEA,
  ADD COLUMN "allowed_domains" TEXT[];

ALTER TABLE "workspace_sandbox_env_vars"
  ADD CONSTRAINT "workspace_sandbox_env_vars_kind"
  CHECK ("kind" IN ('config', 'https_secret'));

ALTER TABLE "workspace_sandbox_env_vars"
  ADD CONSTRAINT "workspace_sandbox_env_vars_https_secret_fields"
  CHECK (
    "kind" <> 'https_secret' OR
    ("placeholder_nonce" IS NOT NULL AND "allowed_domains" IS NOT NULL)
  );

-- Hot path filter for slice 2: loadEnv will filter `kind = 'config'` on every
-- sandbox mount.
CREATE INDEX CONCURRENTLY "workspace_sandbox_env_vars_workspace_kind_idx"
  ON "workspace_sandbox_env_vars" ("workspaceId", "kind");
