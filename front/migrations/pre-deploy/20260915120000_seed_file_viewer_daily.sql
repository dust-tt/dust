-- Seed legacy observations BEFORE deploying writers that update lastViewedAt.
-- Otherwise a returning viewer could erase their only earlier observation.
-- This cannot reconstruct historical first views or missing days of activity.
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;

INSERT INTO "file_viewer_dailies"
  ("workspaceId", "fileId", "email", "viewedOn", "firstViewedAt", "lastViewedAt", "createdAt", "updatedAt")
SELECT grants."workspaceId", shares."fileId", lower(btrim(grants.email)),
       (grants."lastViewedAt" AT TIME ZONE 'UTC')::date,
       MIN(grants."lastViewedAt"), MAX(grants."lastViewedAt"), NOW(), NOW()
FROM "sharing_grants" AS grants
JOIN "shareable_files" AS shares
  ON shares.id = grants."shareableFileId" AND shares."workspaceId" = grants."workspaceId"
WHERE grants.email IS NOT NULL AND grants."lastViewedAt" IS NOT NULL
GROUP BY grants."workspaceId", shares."fileId", lower(btrim(grants.email)),
         (grants."lastViewedAt" AT TIME ZONE 'UTC')::date
ON CONFLICT ("workspaceId", "fileId", "email", "viewedOn") DO UPDATE SET
  "firstViewedAt" = LEAST("file_viewer_dailies"."firstViewedAt", EXCLUDED."firstViewedAt"),
  "lastViewedAt" = GREATEST("file_viewer_dailies"."lastViewedAt", EXCLUDED."lastViewedAt"),
  "updatedAt" = NOW();
