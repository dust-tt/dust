-- Create temp table
CREATE TEMP TABLE workos_mapping (
    workos_user_id VARCHAR(255),
    auth0_user_id VARCHAR(255),
    created BOOLEAN
);

-- Load CSV from disk
\copy workos_mapping FROM 'migrations/db/migration-result-auth0.csv' WITH CSV HEADER;

-- Verify data loaded correctly
SELECT COUNT(*) FROM workos_mapping;

-- Check how many are not null before the update
SELECT COUNT(*) FROM users WHERE "workOSUserId" IS NOT NULL;

-- Run the backfill update
UPDATE users
SET "workOSUserId" = wm.workos_user_id
FROM workos_mapping wm
WHERE users."workOSUserId" IS NULL
  AND users."auth0Sub" = wm."auth0_user_id"
  AND users.email IN (
    SELECT email
    FROM users
    GROUP BY email
    HAVING COUNT(*) = 1
  );

-- Check how many rows were updated
SELECT COUNT(*) FROM users WHERE "workOSUserId" IS NOT NULL;

-- Clean up
DROP TABLE workos_mapping;