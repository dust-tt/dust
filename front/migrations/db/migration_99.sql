-- Migration created on Oct 04, 2024
-- Step 1: Drop the existing foreign key constraint
ALTER TABLE "keys"
DROP CONSTRAINT "keys_groupId_fkey";

-- Step 2: Add the new foreign key constraint
ALTER TABLE "keys" ADD FOREIGN KEY ("groupId") REFERENCES "groups" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;