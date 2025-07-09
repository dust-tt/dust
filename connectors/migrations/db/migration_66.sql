-- Migration created on Apr 23, 2025

ALTER TABLE "remote_tables" 
  ALTER COLUMN "internalId" TYPE TEXT,
  ALTER COLUMN "name" TYPE TEXT,
  ALTER COLUMN "databaseName" TYPE TEXT, 
  ALTER COLUMN "schemaName" TYPE TEXT;