UPDATE workspaces
SET
  "sharingPolicy" = 'workspace_only'
WHERE
  metadata->>'allowContentCreationFileSharing' = 'false';
