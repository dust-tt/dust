-- Migration created on Mar 20, 2026
-- Migrate legacy "workspace" share scope to "workspace_and_emails".
UPDATE "shareable_files"
SET
  "shareScope" = 'workspace_and_emails'
WHERE
  "shareScope" = 'workspace';