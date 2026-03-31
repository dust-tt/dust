-- Migration created on Mar 31, 2026
-- Cleanup: drop legacy groupId and scope columns from keys table (replaced by groupIds)

ALTER TABLE "keys" DROP COLUMN "groupId";
ALTER TABLE "keys" DROP COLUMN "scope";
