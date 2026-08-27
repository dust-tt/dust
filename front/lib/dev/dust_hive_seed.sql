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
--   :userId, :workspaceId, :subscriptionId
--   :email, :username, :name, :firstName, :lastName
--   :workspaceName
--   :workOSUserId, :provider, :providerId, :imageUrl

WITH
-- Step 0: Get the required plan (fails gracefully if missing, detected by seed.ts)
required_plan AS (
  SELECT id FROM plans WHERE code = 'FREE_UPGRADED_PLAN'
),

-- Step 1: Upsert user
inserted_user AS (
  INSERT INTO users (
    "sId", username, email, name, "firstName", "lastName",
    "workOSUserId", provider, "providerId", "imageUrl",
    "isDustSuperUser", "lastLoginAt", "createdAt", "updatedAt"
  )
  VALUES (
    :userId,
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
    :workspaceId,
    :workspaceName,
    NULL,
    NULL,
    false,
    'org_01KEF5MMN72N50JA89BDD5TQ4T',
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

-- Step 5d: Seed default governance capabilities (type-wide -1 grants on the global group).
-- Mirrors seedWorkspaceCapabilities (front/lib/api/permissions/governance_seeding.ts), which
-- workspace provisioning runs but this raw-SQL seed bypasses. A fresh workspace has no feature
-- flags and no Builders group, so every "everyone" capability resolves to the global group;
-- "create skill" resolves to admins_only (no row). Keep in sync with CAPABILITY_SEEDERS.
inserted_group_permissions AS (
  INSERT INTO group_permissions (
    "workspaceId", "groupId", "grantType", "resourceType", "resourceId", "createdAt", "updatedAt"
  )
  SELECT gg."workspaceId", gg.id, capability.grant_type, capability.resource_type, -1, NOW(), NOW()
  FROM inserted_global_group gg
  CROSS JOIN (
    VALUES
      ('create', 'agent'),
      ('publish', 'agent'),
      ('invite', 'frame'),
      ('publish', 'frame'),
      ('reader', 'skill')
  ) AS capability(grant_type, resource_type)
  RETURNING id
),

-- Step 5e: Seed instance-level space group_permissions for the default spaces. Mirrors
-- SpaceResource.writeGroupPermissions / spaceGroupRoles (front/lib/resources/space_resource.ts),
-- which real space provisioning runs but this raw-SQL seed bypasses. Without these rows, space
-- access resolves to nothing once use_legacy_acls is off (the default post-migration). Keep in sync
-- with spaceGroupRoles: system space => system group 'member'; global and conversations spaces =>
-- global group 'reader'.
inserted_space_group_permissions AS (
  INSERT INTO group_permissions (
    "workspaceId", "groupId", "grantType", "resourceType", "resourceId", "createdAt", "updatedAt"
  )
  SELECT sg."workspaceId", sg.id, 'member', 'space', ss.id, NOW(), NOW()
  FROM inserted_system_group sg
  CROSS JOIN inserted_system_space ss
  UNION ALL
  SELECT gg."workspaceId", gg.id, 'reader', 'space', gs.id, NOW(), NOW()
  FROM inserted_global_group gg
  CROSS JOIN inserted_global_space gs
  UNION ALL
  SELECT gg."workspaceId", gg.id, 'reader', 'space', cs.id, NOW(), NOW()
  FROM inserted_global_group gg
  CROSS JOIN inserted_conversations_space cs
  RETURNING id
),

-- Step 6: Create membership
inserted_membership AS (
  INSERT INTO memberships ("workspaceId", "userId", role, origin, "startAt", "endAt", "firstUsedAt", "createdAt", "updatedAt")
  SELECT w.id, u.id, 'admin', 'invited', NOW(), NULL, NOW(), NOW(), NOW()
  FROM inserted_workspace w
  CROSS JOIN inserted_user u
  RETURNING id
),

-- Step 7: Create subscription (uses required_plan from Step 0)
inserted_subscription AS (
  INSERT INTO subscriptions (
    "workspaceId", "sId", status, trialing, "paymentFailingSince",
    "startDate", "endDate", "planId", "stripeSubscriptionId", "createdAt", "updatedAt"
  )
  SELECT
    w.id,
    :subscriptionId,
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
  CROSS JOIN required_plan p
  RETURNING id
)

-- Return summary (subscription_id will be NULL if FREE_UPGRADED_PLAN doesn't exist)
SELECT
  (SELECT id FROM inserted_user) AS user_id,
  (SELECT id FROM inserted_workspace) AS workspace_id,
  (SELECT id FROM inserted_subscription) AS subscription_id;
