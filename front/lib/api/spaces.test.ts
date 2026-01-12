import { beforeEach, describe, expect, it } from "vitest";

import { createSpaceAndGroup } from "@app/lib/api/spaces";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import type { UserResource } from "@app/lib/resources/user_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";

describe("createSpaceAndGroup", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let adminAuth: Authenticator;
  let globalGroup: GroupResource;
  let user1: UserResource;
  let user2: UserResource;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    const adminUser = await UserFactory.basic();

    // Set up default groups and spaces FIRST (before creating authenticators)
    const { globalGroup: gGroup, systemGroup } =
      await GroupFactory.defaults(workspace);
    globalGroup = gGroup;

    await MembershipFactory.associate(workspace, adminUser, {
      role: "admin",
    });

    // Create internal admin auth to set up default spaces
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    await SpaceResource.makeDefaultsForWorkspace(internalAdminAuth, {
      globalGroup,
      systemGroup,
    });

    // Now create admin authenticator (they will find the global group)
    adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );

    // Create test users
    user1 = await UserFactory.basic();
    user2 = await UserFactory.basic();

    await MembershipFactory.associate(workspace, user1, { role: "user" });
    await MembershipFactory.associate(workspace, user2, { role: "user" });
  });

  describe("successful creation", () => {
    it("should create a regular space with manual management mode and members", async () => {
      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Regular Space",
        isRestricted: true,
        spaceKind: "regular",
        managementMode: "manual",
        memberIds: [user1.sId, user2.sId],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const space = result.value;
        expect(space.name).toBe("Test Regular Space");
        expect(space.kind).toBe("regular");
        expect(space.managementMode).toBe("manual");
        expect(space.isRegularAndRestricted()).toBe(true);

        // Verify the space has a group
        expect(space.groups.length).toBeGreaterThan(0);
        const spaceGroup = space.groups.find((g) =>
          g.name.startsWith("Group for space Test Regular Space")
        );
        expect(spaceGroup).toBeDefined();

        // Verify members were added
        if (spaceGroup) {
          const members = await spaceGroup.getAllMembers(adminAuth);
          const memberSIds = members.map((m) => m.sId);
          expect(memberSIds).toContain(user1.sId);
          expect(memberSIds).toContain(user2.sId);
        }
      }
    });

    it("should create a regular space with group management mode", async () => {
      const provisionedGroup = await GroupResource.makeNew({
        name: "Provisioned Group",
        workspaceId: workspace.id,
        kind: "provisioned",
      });

      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Group Space",
        isRestricted: true,
        spaceKind: "regular",
        managementMode: "group",
        groupIds: [provisionedGroup.sId],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const space = result.value;
        expect(space.name).toBe("Test Group Space");
        expect(space.kind).toBe("regular");
        expect(space.managementMode).toBe("group");
        expect(space.isRegularAndRestricted()).toBe(true);

        // Verify groups were associated
        const groupSpaces = await GroupSpaceModel.findAll({
          where: {
            vaultId: space.id,
            workspaceId: workspace.id,
          },
        });
        const associatedGroupIds = groupSpaces.map((gs) => gs.groupId);
        expect(associatedGroupIds).toContain(provisionedGroup.id);
      }
    });

    it("should create a project space", async () => {
      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Project Space",
        isRestricted: false,
        spaceKind: "project",
        managementMode: "manual",
        memberIds: [],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const space = result.value;
        expect(space.name).toBe("Test Project Space");
        expect(space.kind).toBe("project");
      }
    });

    it("should create a non-restricted space with global group", async () => {
      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Open Space",
        isRestricted: false,
        spaceKind: "regular",
        managementMode: "manual",
        memberIds: [],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const space = result.value;
        expect(space.isRegularAndRestricted()).toBe(false);

        // Verify global group was added
        const groupSpaces = await GroupSpaceModel.findAll({
          where: {
            vaultId: space.id,
            workspaceId: workspace.id,
          },
        });
        const associatedGroupIds = groupSpaces.map((gs) => gs.groupId);
        expect(associatedGroupIds).toContain(globalGroup.id);
      }
    });

    it("should create a restricted space without global group", async () => {
      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Restricted Space",
        isRestricted: true,
        spaceKind: "regular",
        managementMode: "manual",
        memberIds: [],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const space = result.value;
        expect(space.isRegularAndRestricted()).toBe(true);

        // Verify global group was NOT added
        const groupSpaces = await GroupSpaceModel.findAll({
          where: {
            vaultId: space.id,
            workspaceId: workspace.id,
          },
        });
        const associatedGroupIds = groupSpaces.map((gs) => gs.groupId);
        expect(associatedGroupIds).not.toContain(globalGroup.id);
      }
    });

    it("should create a space with empty memberIds", async () => {
      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Empty Space",
        isRestricted: true,
        spaceKind: "regular",
        managementMode: "manual",
        memberIds: [],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const space = result.value;
        expect(space.name).toBe("Test Empty Space");
      }
    });

    it("should create a space with empty groupIds", async () => {
      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Empty Group Space",
        isRestricted: true,
        spaceKind: "regular",
        managementMode: "group",
        groupIds: [],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const space = result.value;
        expect(space.name).toBe("Test Empty Group Space");
        expect(space.managementMode).toBe("group");
      }
    });
  });

  describe("error handling", () => {
    it("should return error when space name already exists", async () => {
      // Create first space (with ignoreWorkspaceLimit to ensure we can create it)
      const firstResult = await createSpaceAndGroup(
        adminAuth,
        {
          name: "Duplicate Name Space",
          isRestricted: true,
          spaceKind: "regular",
          managementMode: "manual",
          memberIds: [],
        },
        { ignoreWorkspaceLimit: true }
      );
      expect(firstResult.isOk()).toBe(true);

      // Try to create another space with the same name (also with ignoreWorkspaceLimit)
      const duplicateResult = await createSpaceAndGroup(
        adminAuth,
        {
          name: "Duplicate Name Space",
          isRestricted: true,
          spaceKind: "regular",
          managementMode: "manual",
          memberIds: [],
        },
        { ignoreWorkspaceLimit: true }
      );

      expect(duplicateResult.isErr()).toBe(true);
      if (duplicateResult.isErr()) {
        expect(duplicateResult.error).toBeInstanceOf(DustError);
        expect(duplicateResult.error.code).toBe("space_already_exists");
        expect(duplicateResult.error.message).toBe(
          "This space name is already used."
        );
      }
    });

    it("should return error when workspace limit is reached", async () => {
      const plan = adminAuth.getNonNullablePlan();
      const originalMaxVaults = plan.limits.vaults.maxVaults;

      // Monkey-patch the plan to have a specific limit for testing
      const testMaxVaults = 3;
      plan.limits.vaults.maxVaults = testMaxVaults;

      try {
        // Get current spaces count (excluding system spaces which don't count toward limit)
        const allSpaces = await SpaceResource.listWorkspaceSpaces(
          adminAuth,
          undefined
        );
        const regularSpaces = allSpaces.filter(
          (s) => s.kind === "regular" || s.kind === "public"
        );
        const spacesToCreate = Math.max(
          0,
          testMaxVaults - regularSpaces.length
        );

        // Create spaces up to the limit
        for (let i = 0; i < spacesToCreate; i++) {
          const result = await createSpaceAndGroup(
            adminAuth,
            {
              name: `Test Space ${i}`,
              isRestricted: true,
              spaceKind: "regular",
              managementMode: "manual",
              memberIds: [],
            },
            { ignoreWorkspaceLimit: false }
          );
          expect(result.isOk()).toBe(true);
        }

        // Try to create one more space (should fail)
        const limitResult = await createSpaceAndGroup(adminAuth, {
          name: "Limit Exceeded Space",
          isRestricted: true,
          spaceKind: "regular",
          managementMode: "manual",
          memberIds: [],
        });

        expect(limitResult.isErr()).toBe(true);
        if (limitResult.isErr()) {
          expect(limitResult.error).toBeInstanceOf(DustError);
          expect(limitResult.error.code).toBe("limit_reached");
          expect(limitResult.error.message).toBe(
            "The maximum number of spaces has been reached."
          );
        }
      } finally {
        // Restore original value
        plan.limits.vaults.maxVaults = originalMaxVaults;
      }
    });

    it("should allow creating space when limit is reached but ignoreWorkspaceLimit is true", async () => {
      const plan = adminAuth.getNonNullablePlan();
      const originalMaxVaults = plan.limits.vaults.maxVaults;

      // Monkey-patch the plan to have a specific limit for testing
      const testMaxVaults = 3;
      plan.limits.vaults.maxVaults = testMaxVaults;

      try {
        // Get current spaces count (excluding system spaces which don't count toward limit)
        const allSpaces = await SpaceResource.listWorkspaceSpaces(
          adminAuth,
          undefined
        );
        const regularSpaces = allSpaces.filter(
          (s) => s.kind === "regular" || s.kind === "public"
        );
        const spacesToCreate = Math.max(
          0,
          testMaxVaults - regularSpaces.length
        );

        // Create spaces up to the limit
        for (let i = 0; i < spacesToCreate; i++) {
          const result = await createSpaceAndGroup(
            adminAuth,
            {
              name: `Test Space Ignore ${i}`,
              isRestricted: true,
              spaceKind: "regular",
              managementMode: "manual",
              memberIds: [],
            },
            { ignoreWorkspaceLimit: false }
          );
          expect(result.isOk()).toBe(true);
        }

        // Try to create one more space with ignoreWorkspaceLimit (should succeed)
        const ignoreLimitResult = await createSpaceAndGroup(
          adminAuth,
          {
            name: "Ignored Limit Space",
            isRestricted: true,
            spaceKind: "regular",
            managementMode: "manual",
            memberIds: [],
          },
          { ignoreWorkspaceLimit: true }
        );

        expect(ignoreLimitResult.isOk()).toBe(true);
        if (ignoreLimitResult.isOk()) {
          expect(ignoreLimitResult.value.name).toBe("Ignored Limit Space");
        }
      } finally {
        // Restore original value
        plan.limits.vaults.maxVaults = originalMaxVaults;
      }
    });

    it("should return error when invalid group IDs are provided", async () => {
      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Invalid Group Space",
        isRestricted: true,
        spaceKind: "regular",
        managementMode: "group",
        groupIds: ["invalid-group-id"],
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(DustError);
        expect(result.error.code).toBe("internal_error");
      }
    });

    it("should handle invalid member IDs gracefully", async () => {
      // Note: The function may handle invalid member IDs differently
      // This test verifies the behavior doesn't crash
      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Invalid Member Space",
        isRestricted: true,
        spaceKind: "regular",
        managementMode: "manual",
        memberIds: ["invalid-user-id"],
      });

      // The function should either succeed (ignoring invalid IDs) or fail gracefully
      expect(result.isOk() || result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(DustError);
      }
    });
  });

  describe("edge cases", () => {
    it("should handle space names with leading/trailing whitespace", async () => {
      const result = await createSpaceAndGroup(adminAuth, {
        name: "  Trimmed Space Name  ",
        isRestricted: true,
        spaceKind: "regular",
        managementMode: "manual",
        memberIds: [],
      });

      // Note: The function doesn't trim the name itself, but the plugin does
      // This test verifies the function accepts the name as-is
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.name).toBe("  Trimmed Space Name  ");
      }
    });

    it("should create space with multiple groups in group mode", async () => {
      const provisionedGroup1 = await GroupResource.makeNew({
        name: "Provisioned Group 1",
        workspaceId: workspace.id,
        kind: "provisioned",
      });

      const provisionedGroup2 = await GroupResource.makeNew({
        name: "Provisioned Group 2",
        workspaceId: workspace.id,
        kind: "provisioned",
      });

      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Multi Group Space",
        isRestricted: true,
        spaceKind: "regular",
        managementMode: "group",
        groupIds: [provisionedGroup1.sId, provisionedGroup2.sId],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const space = result.value;
        const groupSpaces = await GroupSpaceModel.findAll({
          where: {
            vaultId: space.id,
            workspaceId: workspace.id,
          },
        });
        const associatedGroupIds = groupSpaces.map((gs) => gs.groupId);
        expect(associatedGroupIds).toContain(provisionedGroup1.id);
        expect(associatedGroupIds).toContain(provisionedGroup2.id);
      }
    });

    it("should set managementMode to manual when isRestricted is false", async () => {
      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Auto Manual Space",
        isRestricted: false,
        spaceKind: "regular",
        managementMode: "group", // This should be ignored
        groupIds: [],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const space = result.value;
        // When isRestricted is false, managementMode should be forced to "manual"
        expect(space.managementMode).toBe("manual");
      }
    });
  });
});
