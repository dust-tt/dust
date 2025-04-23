-- Migration created on Apr 23, 2025

ALTER TABLE "remote_tables" 
  ALTER COLUMN "internalId" TYPE TEXT,
  ALTER COLUMN "name" TYPE TEXT,
  ALTER COLUMN "database_name" TYPE TEXT, 
  ALTER COLUMN "schema_name" TYPE TEXT;