DROP INDEX CONCURRENTLY IF EXISTS "credits_type_workspace_dates_unique_idx";

CREATE UNIQUE INDEX CONCURRENTLY "credits_type_workspace_dates_unique_idx"
  ON "credits" ("workspaceId", "type", "startDate", "expirationDate")
  WHERE "startDate" IS NOT NULL;
