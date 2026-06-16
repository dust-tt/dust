-- Migration created on Jun 6, 2026
-- Canonical paths (ref) and legacy paths can exceed VARCHAR(255).
ALTER TABLE "authorized_file_accesses"
ALTER COLUMN "ref" TYPE VARCHAR(4096);

ALTER TABLE "authorized_file_accesses"
ALTER COLUMN "legacyPath" TYPE VARCHAR(4096);