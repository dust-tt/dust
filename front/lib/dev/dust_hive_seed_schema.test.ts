/**
 * Schema validation test for dust-hive SQL seed.
 *
 * This test validates that the raw SQL used by dust-hive to seed dev environments
 * is compatible with the current database schema. If this test fails, it means
 * the schema has drifted and the dust-hive seed.sql needs to be updated.
 *
 * The SQL here mirrors x/henry/dust-hive/seed.sql exactly.
 */

import { QueryTypes } from "sequelize";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { frontSequelize } from "@app/lib/resources/storage";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";

// Error message with prompt for Claude Code when schema drifts
const SCHEMA_DRIFT_ERROR = `
================================================================================
DUST-HIVE SEED SQL SCHEMA DRIFT DETECTED
================================================================================

The database schema has changed and the dust-hive seed SQL is no longer compatible.
Please update the dust-hive seed SQL to match the current schema.

To fix this, run Claude Code with the following prompt:

---
The dust-hive seed SQL schema validation test is failing. Please:

1. Look at the Sequelize model definitions for these tables:
   - front/lib/resources/storage/models/user.ts
   - front/lib/resources/storage/models/workspace.ts
   - front/lib/resources/storage/models/groups.ts
   - front/lib/resources/storage/models/spaces.ts
   - front/lib/resources/storage/models/group_spaces.ts
   - front/lib/resources/storage/models/membership.ts
   - front/lib/models/plan.ts (for SubscriptionModel)

2. Check recent migrations in front/migrations/ for any schema changes.

3. Update x/henry/dust-hive/seed.sql to match the current schema:
   - Add any new required columns
   - Update column names if renamed
   - Fix any type mismatches

4. Update front/lib/dev/dust_hive_seed_schema.test.ts to match the SQL changes.

5. Run the test again to verify the fix.
---

Error details:
`;

describe("dust-hive seed SQL schema compatibility", () => {
  // Test data - these will be cleaned up after the test
  const testUserSId = generateRandomModelSId();
  const testWorkspaceSId = generateRandomModelSId();
  const testSubscriptionSId = generateRandomModelSId();

  // Track created IDs for cleanup
  let createdUserId: number | null = null;
  let createdWorkspaceId: number | null = null;

  afterAll(async () => {
    // Clean up test data in reverse order of dependencies
    if (createdWorkspaceId) {
      await frontSequelize.query(
        `DELETE FROM subscriptions WHERE "workspaceId" = :workspaceId`,
        { replacements: { workspaceId: createdWorkspaceId }, type: QueryTypes.DELETE }
      );
      await frontSequelize.query(
        `DELETE FROM memberships WHERE "workspaceId" = :workspaceId`,
        { replacements: { workspaceId: createdWorkspaceId }, type: QueryTypes.DELETE }
      );
      await frontSequelize.query(
        `DELETE FROM group_vaults WHERE "workspaceId" = :workspaceId`,
        { replacements: { workspaceId: createdWorkspaceId }, type: QueryTypes.DELETE }
      );
      await frontSequelize.query(
        `DELETE FROM vaults WHERE "workspaceId" = :workspaceId`,
        { replacements: { workspaceId: createdWorkspaceId }, type: QueryTypes.DELETE }
      );
      await frontSequelize.query(
        `DELETE FROM groups WHERE "workspaceId" = :workspaceId`,
        { replacements: { workspaceId: createdWorkspaceId }, type: QueryTypes.DELETE }
      );
      await frontSequelize.query(
        `DELETE FROM workspaces WHERE id = :workspaceId`,
        { replacements: { workspaceId: createdWorkspaceId }, type: QueryTypes.DELETE }
      );
    }
    if (createdUserId) {
      await frontSequelize.query(
        `DELETE FROM users WHERE id = :userId`,
        { replacements: { userId: createdUserId }, type: QueryTypes.DELETE }
      );
    }
  });

  it("validates that dust-hive seed SQL is compatible with current schema", async () => {
    // This SQL mirrors x/henry/dust-hive/seed.sql exactly.
    // If this test fails, both files need to be updated together.
    const seedSql = `
      WITH
      -- Step 1: Insert user
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
        (SELECT id FROM inserted_workspace) AS workspace_id
    `;

    try {
      const result = await frontSequelize.query(seedSql, {
        replacements: {
          userSid: testUserSId,
          username: "test_dust_hive_seed",
          email: `test_dust_hive_${Date.now()}@example.com`,
          name: "Test Dust Hive Seed",
          firstName: "Test",
          lastName: null,
          workOSUserId: null,
          provider: null,
          providerId: null,
          imageUrl: null,
          workspaceSid: testWorkspaceSId,
          workspaceName: "Test Dust Hive Workspace",
          subscriptionSid: testSubscriptionSId,
        },
        type: QueryTypes.SELECT,
      });

      // Store IDs for cleanup
      const row = result[0] as { user_id: number; workspace_id: number };
      createdUserId = row.user_id;
      createdWorkspaceId = row.workspace_id;

      // Verify all records were created
      expect(createdUserId).toBeGreaterThan(0);
      expect(createdWorkspaceId).toBeGreaterThan(0);

      // Verify the data can be read back
      const [users] = await frontSequelize.query(
        `SELECT id, "sId", username, "isDustSuperUser" FROM users WHERE id = :userId`,
        { replacements: { userId: createdUserId }, type: QueryTypes.SELECT }
      );
      expect(users).toBeDefined();

      const [workspaces] = await frontSequelize.query(
        `SELECT id, "sId", name FROM workspaces WHERE id = :workspaceId`,
        { replacements: { workspaceId: createdWorkspaceId }, type: QueryTypes.SELECT }
      );
      expect(workspaces).toBeDefined();

    } catch (error) {
      // Output helpful error message for Claude Code
      console.error(SCHEMA_DRIFT_ERROR);
      console.error(error);
      throw new Error(
        `Dust-hive seed SQL schema validation failed. See error output above for details and fix instructions.`
      );
    }
  });
});
