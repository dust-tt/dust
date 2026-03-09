-- ============================================================
-- BYOK workspace seed script (idempotent)
-- Creates a workspace on the FREE_BYOK plan and adds an existing user as admin.
-- If the user already has a BYOK workspace, returns the existing one.
--
-- USAGE: psql $FRONT_DATABASE_URI -v email="'john.doe@dust.tt'" -f lib/dev/byok_seed.sql
-- ============================================================

WITH

-- Generate sIds (only used if we need to create)
sids AS (
  SELECT
    substring(md5(random()::text), 1, 10) AS workspace_sid,
    substring(md5(random()::text), 1, 10) AS subscription_sid
),

-- Step 0: Look up existing user
existing_user AS (
  SELECT id FROM users WHERE email = :email
),

-- Step 1: Upsert FREE_BYOK plan (based on FREE_UPGRADED_PLAN with isByok = true)
required_plan AS (
  INSERT INTO plans (
    code, name, "trialPeriodDays", "canUseProduct",
    "maxMessages", "maxMessagesTimeframe", "isDeepDiveAllowed",
    "maxUsersInWorkspace", "maxVaultsInWorkspace", "maxImagesPerWeek",
    "isSlackbotAllowed", "isManagedConfluenceAllowed", "isManagedSlackAllowed",
    "isManagedNotionAllowed", "isManagedGoogleDriveAllowed", "isManagedGithubAllowed",
    "isManagedIntercomAllowed", "isManagedWebCrawlerAllowed", "isManagedSalesforceAllowed",
    "isSSOAllowed", "isSCIMAllowed",
    "maxDataSourcesCount", "maxDataSourcesDocumentsCount", "maxDataSourcesDocumentsSizeMb",
    "isByok", "createdAt", "updatedAt"
  )
  VALUES (
    'FREE_BYOK', 'Free (BYOK)', 0, true,
    -1, 'lifetime', true,
    -1, -1, 50,
    true, true, true,
    true, true, true,
    true, true, true,
    true, false,
    -1, -1, 2,
    true, NOW(), NOW()
  )
  ON CONFLICT (code) DO UPDATE SET "isByok" = true, "updatedAt" = NOW()
  RETURNING id
),

-- Step 2: Check if user already has a BYOK workspace
existing_byok_workspace AS (
  SELECT w.id, w."sId"
  FROM workspaces w
  JOIN memberships m ON m."workspaceId" = w.id
  JOIN subscriptions s ON s."workspaceId" = w.id AND s.status = 'active'
  JOIN plans p ON p.id = s."planId"
  WHERE m."userId" = (SELECT id FROM existing_user)
    AND p.code = 'FREE_BYOK'
  LIMIT 1
),

-- Step 3: Create workspace (skipped if already exists)
inserted_workspace AS (
  INSERT INTO workspaces ("sId", name, metadata, "createdAt", "updatedAt")
  SELECT
    s.workspace_sid,
    'Dust (BYOK)',
    '{"isBusiness": false}'::jsonb,
    NOW(),
    NOW()
  FROM sids s
  WHERE EXISTS (SELECT 1 FROM existing_user)
    AND NOT EXISTS (SELECT 1 FROM existing_byok_workspace)
  RETURNING id, "sId"
),

-- Resolve workspace: existing or newly created
resolved_workspace AS (
  SELECT id, "sId" FROM existing_byok_workspace
  UNION ALL
  SELECT id, "sId" FROM inserted_workspace
),

-- Step 4a: Create system group
inserted_system_group AS (
  INSERT INTO groups ("workspaceId", name, kind, "createdAt", "updatedAt")
  SELECT id, 'System', 'system', NOW(), NOW()
  FROM inserted_workspace
  RETURNING id, "workspaceId"
),

-- Step 4b: Create global group
inserted_global_group AS (
  INSERT INTO groups ("workspaceId", name, kind, "createdAt", "updatedAt")
  SELECT id, 'Workspace', 'global', NOW(), NOW()
  FROM inserted_workspace
  RETURNING id, "workspaceId"
),

-- Step 5a: Create system space
inserted_system_space AS (
  INSERT INTO vaults ("workspaceId", name, kind, "createdAt", "updatedAt")
  SELECT id, 'System', 'system', NOW(), NOW()
  FROM inserted_workspace
  RETURNING id, "workspaceId"
),

-- Step 5b: Create global space
inserted_global_space AS (
  INSERT INTO vaults ("workspaceId", name, kind, "createdAt", "updatedAt")
  SELECT id, 'Company Data', 'global', NOW(), NOW()
  FROM inserted_workspace
  RETURNING id, "workspaceId"
),

-- Step 5c: Create conversations space
inserted_conversations_space AS (
  INSERT INTO vaults ("workspaceId", name, kind, "createdAt", "updatedAt")
  SELECT id, 'Conversations', 'conversations', NOW(), NOW()
  FROM inserted_workspace
  RETURNING id, "workspaceId"
),

-- Step 6a: Link system group → system space
link_system AS (
  INSERT INTO group_vaults ("workspaceId", "groupId", "vaultId", "createdAt", "updatedAt")
  SELECT sg."workspaceId", sg.id, ss.id, NOW(), NOW()
  FROM inserted_system_group sg
  CROSS JOIN inserted_system_space ss
  RETURNING "vaultId"
),

-- Step 6b: Link global group → global space
link_global AS (
  INSERT INTO group_vaults ("workspaceId", "groupId", "vaultId", "createdAt", "updatedAt")
  SELECT gg."workspaceId", gg.id, gs.id, NOW(), NOW()
  FROM inserted_global_group gg
  CROSS JOIN inserted_global_space gs
  RETURNING "vaultId"
),

-- Step 6c: Link global group → conversations space
link_conversations AS (
  INSERT INTO group_vaults ("workspaceId", "groupId", "vaultId", "createdAt", "updatedAt")
  SELECT gg."workspaceId", gg.id, cs.id, NOW(), NOW()
  FROM inserted_global_group gg
  CROSS JOIN inserted_conversations_space cs
  RETURNING "vaultId"
),

-- Step 7: Create subscription
inserted_subscription AS (
  INSERT INTO subscriptions (
    "workspaceId", "sId", status, trialing,
    "startDate", "endDate", "planId", "stripeSubscriptionId",
    "createdAt", "updatedAt"
  )
  SELECT
    w.id,
    s.subscription_sid,
    'active',
    false,
    NOW(),
    NULL,
    p.id,
    NULL,
    NOW(),
    NOW()
  FROM inserted_workspace w
  CROSS JOIN sids s
  CROSS JOIN required_plan p
  RETURNING id
),

-- Step 8a: Create membership (user → workspace as admin)
inserted_membership AS (
  INSERT INTO memberships ("workspaceId", "userId", role, origin, "startAt", "endAt", "createdAt", "updatedAt")
  SELECT w.id, u.id, 'admin', 'invited', NOW(), NULL, NOW(), NOW()
  FROM inserted_workspace w
  CROSS JOIN existing_user u
  RETURNING id
),

-- Step 8b: Add user to global group
inserted_group_membership AS (
  INSERT INTO group_memberships ("groupId", "userId", "workspaceId", "startAt", "endAt", status, "createdAt", "updatedAt")
  SELECT gg.id, u.id, gg."workspaceId", NOW(), NULL, 'active', NOW(), NOW()
  FROM inserted_global_group gg
  CROSS JOIN existing_user u
  RETURNING id
)

-- Summary
SELECT
  (SELECT id FROM existing_user) AS user_id,
  (SELECT id FROM resolved_workspace) AS workspace_id,
  (SELECT "sId" FROM resolved_workspace) AS workspace_sid,
  CASE
    WHEN NOT EXISTS (SELECT 1 FROM existing_user) THEN 'user_not_found'
    WHEN EXISTS (SELECT 1 FROM existing_byok_workspace) THEN 'already_existed'
    ELSE 'created'
  END AS status;
