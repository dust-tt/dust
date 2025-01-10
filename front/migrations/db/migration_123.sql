-- Migration created on Dec 02, 2024
ALTER TABLE "data_sources" ALTER COLUMN "editedByUserId" DROP NOT NULL;
ALTER TABLE "data_source_views" ALTER COLUMN "editedByUserId" DROP NOT NULL;
