-- Seed script for dust-hive dev environment
-- This SQL file seeds a dev user, workspace, and associated resources
--
-- MAINTAINABILITY NOTES:
-- 1. Column names and table names match the Sequelize models exactly
-- 2. If schema drifts, this will fail with clear errors (missing column, wrong type)
-- 3. Run `psql -f seed.sql` after schema changes to validate compatibility
-- 4. All sIds are passed as parameters $1, $2, etc.
--
-- Parameters (in order):
--   $1: user_sid
--   $2: workspace_sid
--   $3: subscription_sid
--   $4: email
--   $5: username
--   $6: name
--   $7: first_name
--   $8: last_name (nullable)
--   $9: workspace_name
--   $10: work_os_user_id (nullable)
--   $11: provider (nullable)
--   $12: provider_id (nullable)
--   $13: image_url (nullable)
--
-- Usage: Called via prepared statement from TypeScript

WITH
-- Step 1: Upsert user
inserted_user AS (
  INSERT INTO users (
    "sId", username, email, name, "firstName", "lastName",
    "workOSUserId", provider, "providerId", "imageUrl",
    "isDustSuperUser", "lastLoginAt", "createdAt", "updatedAt"
  )
  VALUES (
    $1,           -- user_sid
    $5,           -- username
    lower($4),    -- email
    $6,           -- name
    $7,           -- first_name
    $8,           -- last_name
    $10,          -- work_os_user_id
    $11,          -- provider
    $12,          -- provider_id
    $13,          -- image_url
    true,         -- isDustSuperUser
    NOW(),
    NOW(),
    NOW()
  )
  ON CONFLICT ("sId") DO UPDATE SET
    "isDustSuperUser" = true,
    "lastLoginAt" = COALESCE(users."lastLoginAt", NOW()),
    "workOSUserId" = COALESCE(EXCLUDED."workOSUserId", users."workOSUserId"),
    "updatedAt" = NOW()
  RETURNING id
),

-- Step 2: Create workspace
inserted_workspace AS (
  INSERT INTO workspaces (
    "sId", name, description, segmentation, "ssoEnforced",
    "workOSOrganizationId", metadata, "createdAt", "updatedAt"
  )
  VALUES (
    $2,           -- workspace_sid
    $9,           -- workspace_name
    NULL,
    NULL,
    false,
    NULL,
    '{"isBusiness": false}'::jsonb,
    NOW(),
    NOW()
  )
  RETURNING id
),

-- Step 3a: Create system group
inserted_system_group AS (
  INSERT INTO groups ("workspaceId", name, kind, "workOSGroupId", "createdAt", "updatedAt")
  SELECT id, 'System', 'system', NULL, NOW(), NOW()
  FROM inserted_workspace
  RETURNING id, "workspaceId"
),

-- Step 3b: Create global group
inserted_global_group AS (
  INSERT INTO groups ("workspaceId", name, kind, "workOSGroupId", "createdAt", "updatedAt")
  SELECT id, 'Workspace', 'global', NULL, NOW(), NOW()
  FROM inserted_workspace
  RETURNING id, "workspaceId"
),

-- Step 4a: Create system space
inserted_system_space AS (
  INSERT INTO vaults ("workspaceId", name, kind, "managementMode", "conversationsEnabled", "createdAt", "updatedAt")
  SELECT id, 'System', 'system', 'manual', false, NOW(), NOW()
  FROM inserted_workspace
  RETURNING id, "workspaceId"
),

-- Step 4b: Create global space
inserted_global_space AS (
  INSERT INTO vaults ("workspaceId", name, kind, "managementMode", "conversationsEnabled", "createdAt", "updatedAt")
  SELECT id, 'Company Data', 'global', 'manual', false, NOW(), NOW()
  FROM inserted_workspace
  RETURNING id, "workspaceId"
),

-- Step 4c: Create conversations space
inserted_conversations_space AS (
  INSERT INTO vaults ("workspaceId", name, kind, "managementMode", "conversationsEnabled", "createdAt", "updatedAt")
  SELECT id, 'Conversations', 'conversations', 'manual', false, NOW(), NOW()
  FROM inserted_workspace
  RETURNING id, "workspaceId"
),

-- Step 5a: Link system group to system space
link_system AS (
  INSERT INTO group_vaults ("workspaceId", "groupId", "vaultId", "createdAt", "updatedAt")
  SELECT sg."workspaceId", sg.id, ss.id, NOW(), NOW()
  FROM inserted_system_group sg
  CROSS JOIN inserted_system_space ss
  RETURNING "vaultId"
),

-- Step 5b: Link global group to global space
link_global AS (
  INSERT INTO group_vaults ("workspaceId", "groupId", "vaultId", "createdAt", "updatedAt")
  SELECT gg."workspaceId", gg.id, gs.id, NOW(), NOW()
  FROM inserted_global_group gg
  CROSS JOIN inserted_global_space gs
  RETURNING "vaultId"
),

-- Step 5c: Link global group to conversations space
link_conversations AS (
  INSERT INTO group_vaults ("workspaceId", "groupId", "vaultId", "createdAt", "updatedAt")
  SELECT gg."workspaceId", gg.id, cs.id, NOW(), NOW()
  FROM inserted_global_group gg
  CROSS JOIN inserted_conversations_space cs
  RETURNING "vaultId"
),

-- Step 6: Create membership
inserted_membership AS (
  INSERT INTO memberships ("workspaceId", "userId", role, origin, "startAt", "endAt", "createdAt", "updatedAt")
  SELECT w.id, u.id, 'admin', 'invited', NOW(), NULL, NOW(), NOW()
  FROM inserted_workspace w
  CROSS JOIN inserted_user u
  RETURNING id
),

-- Step 7: Create subscription
inserted_subscription AS (
  INSERT INTO subscriptions (
    "workspaceId", "sId", status, trialing, "paymentFailingSince",
    "startDate", "endDate", "planId", "stripeSubscriptionId", "createdAt", "updatedAt"
  )
  SELECT
    w.id,
    $3,           -- subscription_sid
    'active',
    false,
    NULL,
    NOW(),
    NULL,
    p.id,
    NULL,
    NOW(),
    NOW()
  FROM inserted_workspace w
  CROSS JOIN plans p
  WHERE p.code = 'FREE_UPGRADED_PLAN'
  RETURNING id
)

-- Return summary
SELECT
  (SELECT id FROM inserted_user) AS user_id,
  (SELECT id FROM inserted_workspace) AS workspace_id,
  $2 AS workspace_sid;
