-- Migration created on Dec 02, 2024
ALTER TABLE "data_sources"  ADD FOREIGN KEY ("editedByUserId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "data_source_views"  ADD FOREIGN KEY ("editedByUserId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
