-- Migration created on Jan 15 2025

-- Migrate the agent_configurations table to use bigint[] for requestedGroupIds.
-- 1. Add new column (brief lock)
ALTER TABLE agent_configurations ADD COLUMN "requestedGroupIds_new" bigint[];

-- 2. Copy data in batches (no lock)
WITH to_update AS (
    SELECT id
    FROM agent_configurations
    WHERE "requestedGroupIds_new" IS NULL
    LIMIT 10000
)
UPDATE agent_configurations
SET "requestedGroupIds_new" = "requestedGroupIds"::bigint[]
WHERE id IN (SELECT id FROM to_update);

-- 3. Verify data is copied correctly (no lock)
SELECT COUNT(*) as total,
       COUNT(CASE WHEN "requestedGroupIds_new" IS NULL THEN 1 END) as null_count
FROM agent_configurations;

-- 4. Switch columns (very brief locks)
BEGIN;
SET lock_timeout = '2s';
ALTER TABLE agent_configurations RENAME COLUMN "requestedGroupIds" TO "requestedGroupIds_old";
ALTER TABLE agent_configurations RENAME COLUMN "requestedGroupIds_new" TO "requestedGroupIds";
-- Set the default for the new column (brief lock)
ALTER TABLE agent_configurations ALTER COLUMN "requestedGroupIds" SET DEFAULT ARRAY[]::bigint[];
ALTER TABLE agent_configurations ALTER COLUMN "requestedGroupIds" SET NOT NULL;
COMMIT;

-- 5. Drop old column when ready (brief lock)
ALTER TABLE agent_configurations DROP COLUMN "requestedGroupIds_old";

-- Migrate the conversations table to use bigint[] for requestedGroupIds.
ALTER TABLE conversations ADD COLUMN "requestedGroupIds_new" bigint[];

-- 2. Copy data in batches (no lock)
WITH to_update AS (
    SELECT id
    FROM conversations
    WHERE "requestedGroupIds_new" IS NULL
    LIMIT 10000
)
UPDATE conversations
SET "requestedGroupIds_new" = "requestedGroupIds"::bigint[]
WHERE id IN (SELECT id FROM to_update);

-- 3. Verify data is copied correctly (no lock)
SELECT COUNT(*) as total,
       COUNT(CASE WHEN "requestedGroupIds_new" IS NULL THEN 1 END) as null_count
FROM conversations;

-- 4. Switch columns (very brief locks)
BEGIN;
SET lock_timeout = '2s';
ALTER TABLE conversations RENAME COLUMN "requestedGroupIds" TO "requestedGroupIds_old";
ALTER TABLE conversations RENAME COLUMN "requestedGroupIds_new" TO "requestedGroupIds";
-- Set the default for the new column (brief lock)
ALTER TABLE conversations ALTER COLUMN "requestedGroupIds" SET DEFAULT ARRAY[]::bigint[];
ALTER TABLE conversations ALTER COLUMN "requestedGroupIds" SET NOT NULL;
COMMIT;

-- 5. Drop old column when ready (brief lock)
ALTER TABLE conversations DROP COLUMN "requestedGroupIds_old";
