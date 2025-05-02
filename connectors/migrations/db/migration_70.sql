-- Migration created on May 02, 2025
ALTER TABLE "bigquery_configurations"
ADD COLUMN "useMetadataForDBML" BOOLEAN NOT NULL DEFAULT FALSE;