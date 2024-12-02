-- Migration created on Dec 02, 2024
ALTER TABLE "data_sources" ALTER COLUMN "editedByUserId" SET NOT NULL;
ALTER TABLE "data_sources_views" ALTER COLUMN "editedByUserId" SET NOT NULL;
