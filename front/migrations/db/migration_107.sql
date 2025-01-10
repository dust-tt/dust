-- Migration created on Oct 24, 2024
UPDATE "vaults"
SET
  name = 'Company Data'
WHERE
  kind = 'global';