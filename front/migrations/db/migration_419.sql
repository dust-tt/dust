CREATE UNIQUE INDEX CONCURRENTLY "credits_type_workspace_dates_unique_idx"
  ON "credits" ("workspaceId", "startDate", "expirationDate")
  WHERE "startDate" IS NOT NULL;
