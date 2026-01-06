/**
 * Schema validation test for dust-hive SQL seed.
 *
 * This test validates that the raw SQL used by dust-hive to seed dev environments
 * is compatible with the current database schema. If this test fails, it means
 * the schema has drifted and dust_hive_seed.sql needs to be updated.
 *
 * The SQL is defined in front/lib/dev/dust_hive_seed.sql (single source of truth).
 */

import * as fs from "fs";
import * as path from "path";

import { QueryTypes } from "sequelize";
import { afterAll, describe, expect, it } from "vitest";

import { frontSequelize } from "@app/lib/resources/storage";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";

// Load the SQL from the shared file
const SQL_FILE_PATH = path.join(__dirname, "dust_hive_seed.sql");

// Error message with prompt for Claude Code when schema drifts
const SCHEMA_DRIFT_ERROR = `
================================================================================
DUST-HIVE SEED SQL SCHEMA DRIFT DETECTED
================================================================================

The database schema has changed and the dust-hive seed SQL is no longer compatible.
Please update front/lib/dev/dust_hive_seed.sql to match the current schema.

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

3. Update front/lib/dev/dust_hive_seed.sql to match the current schema:
   - Add any new required columns
   - Update column names if renamed
   - Fix any type mismatches

4. Run the test again to verify the fix.
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
        {
          replacements: { workspaceId: createdWorkspaceId },
          type: QueryTypes.DELETE,
        }
      );
      await frontSequelize.query(
        `DELETE FROM memberships WHERE "workspaceId" = :workspaceId`,
        {
          replacements: { workspaceId: createdWorkspaceId },
          type: QueryTypes.DELETE,
        }
      );
      await frontSequelize.query(
        `DELETE FROM group_vaults WHERE "workspaceId" = :workspaceId`,
        {
          replacements: { workspaceId: createdWorkspaceId },
          type: QueryTypes.DELETE,
        }
      );
      await frontSequelize.query(
        `DELETE FROM vaults WHERE "workspaceId" = :workspaceId`,
        {
          replacements: { workspaceId: createdWorkspaceId },
          type: QueryTypes.DELETE,
        }
      );
      await frontSequelize.query(
        `DELETE FROM groups WHERE "workspaceId" = :workspaceId`,
        {
          replacements: { workspaceId: createdWorkspaceId },
          type: QueryTypes.DELETE,
        }
      );
      await frontSequelize.query(
        `DELETE FROM workspaces WHERE id = :workspaceId`,
        {
          replacements: { workspaceId: createdWorkspaceId },
          type: QueryTypes.DELETE,
        }
      );
    }
    if (createdUserId) {
      await frontSequelize.query(`DELETE FROM users WHERE id = :userId`, {
        replacements: { userId: createdUserId },
        type: QueryTypes.DELETE,
      });
    }
  });

  it("validates that dust-hive seed SQL is compatible with current schema", async () => {
    // Read SQL from the shared file
    const seedSql = fs.readFileSync(SQL_FILE_PATH, "utf-8");

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
        {
          replacements: { workspaceId: createdWorkspaceId },
          type: QueryTypes.SELECT,
        }
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
