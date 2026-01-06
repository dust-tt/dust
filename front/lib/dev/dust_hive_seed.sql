-- Seed script for dust-hive dev environment
-- This SQL file seeds a dev user, workspace, and associated resources.
--
-- SINGLE SOURCE OF TRUTH: This file is used by both:
-- - dust-hive (x/henry/dust-hive) for seeding dev environments
-- - front/lib/dev/dust_hive_seed_schema.test.ts for schema validation
--
-- MAINTAINABILITY:
-- 1. Column names and table names match the Sequelize models exactly
-- 2. If schema drifts, the test will fail with clear errors
-- 3. The test outputs a prompt for Claude Code to fix the drift
--
-- PARAMETERS (using Sequelize replacements :paramName syntax):
--   :userSid, :workspaceSid, :subscriptionSid
--   :email, :username, :name, :firstName, :lastName
--   :workspaceName
--   :workOSUserId, :provider, :providerId, :imageUrl

WITH
-- Step 1: Upsert user
inserted_user AS (
  INSERT INTO users (
    "sId", username, email, name, "firstName", "lastName",
    "workOSUserId", provider, "providerId", "imageUrl",
    "isDustSuperUser", "lastLoginAt", "createdAt", "updatedAt"
  )
  VALUES (
    :userSid,
    :username,
    lower(:email),
    :name,
    :firstName,
    :lastName,
    :workOSUserId,
    :provider,
    :providerId,
    :imageUrl,
    true,
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
    :workspaceSid,
    :workspaceName,
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
  INSERT INTO vaults ("workspaceId", name, kind, "managementMode", "createdAt", "updatedAt")
  SELECT id, 'System', 'system', 'manual',NOW(), NOW()
  FROM inserted_workspace
  RETURNING id, "workspaceId"
),

-- Step 4b: Create global space
inserted_global_space AS (
  INSERT INTO vaults ("workspaceId", name, kind, "managementMode", "createdAt", "updatedAt")
  SELECT id, 'Company Data', 'global', 'manual', NOW(), NOW()
  FROM inserted_workspace
  RETURNING id, "workspaceId"
),

-- Step 4c: Create conversations space
inserted_conversations_space AS (
  INSERT INTO vaults ("workspaceId", name, kind, "managementMode", "createdAt", "updatedAt")
  SELECT id, 'Conversations', 'conversations', 'manual', NOW(), NOW()
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
    :subscriptionSid,
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
  (SELECT id FROM inserted_workspace) AS workspace_id;
