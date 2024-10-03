-- Migration created on Sep 26, 2024
UPDATE apps
SET
  "deletedAt" = NOW ()
WHERE
  "visibility" = 'deleted'
  AND "deletedAt" IS NULL;