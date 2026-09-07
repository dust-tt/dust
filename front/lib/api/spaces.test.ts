import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { DATABASE_FILE_SYSTEM_POD_PREFIX } from "@app/lib/api/file_system/storage_mode";
import { getProjectConversationsDatasourceName } from "@app/lib/api/projects/data_sources";
import {
  createSpaceAndGroup,
  softDeleteSpaceAndLaunchScrubWorkflow,
} from "@app/lib/api/spaces";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { DataSourceViewFactory } from "@app/tests/utils/DataSourceViewFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { SPACE_KINDS } from "@app/types/space";
import { beforeEach, describe, expect, it, vi } from "vitest";

async function fetchNonGlobalGroup(space: SpaceResource, auth: Authenticator) {
  const [group] = await space.fetchRegularAutoGroups(auth);
  return group ?? null;
}

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
    it("only allows fresh database filesystem Pods when the flag is enabled", async () => {
      const params = {
        name: `${DATABASE_FILE_SYSTEM_POD_PREFIX}Playground`,
        isRestricted: true,
        spaceKind: "project" as const,
        managementMode: "manual" as const,
        memberIds: [],
      };

      const disabledRes = await createSpaceAndGroup(adminAuth, params);
      expect(disabledRes.isErr() && disabledRes.error.code).toBe(
        "invalid_request_error"
      );

      await FeatureFlagFactory.basic(adminAuth, "dust_filesystem");
      const enabledRes = await createSpaceAndGroup(adminAuth, params);
      expect(enabledRes.isOk()).toBe(true);
      if (enabledRes.isErr()) {
        return;
      }

      const sameModeRenameRes = await enabledRes.value.updateName(
        adminAuth,
        `${DATABASE_FILE_SYSTEM_POD_PREFIX}Renamed`
      );
      expect(sameModeRenameRes.isOk()).toBe(true);

      const removePrefixRes = await enabledRes.value.updateName(
        adminAuth,
        "Regular Pod"
      );
      expect(removePrefixRes.isErr()).toBe(true);
    });

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
        expect(await space.isRestricted(adminAuth)).toBe(true);

        // Verify the space has a group
        const groups = await space.fetchGroupResources(adminAuth);
        expect(groups.length).toBeGreaterThan(0);
        const spaceGroup = groups.find((g) =>
          g.name.startsWith("Group for space Test Regular Space")
        );
        expect(spaceGroup).toBeDefined();

        // Verify members were added
        if (spaceGroup) {
          const members = await spaceGroup.getAllMembers(adminAuth);
          const memberIds = members.map((m) => m.sId);
          expect(memberIds).toContain(user1.sId);
          expect(memberIds).toContain(user2.sId);
        }
      }
    });

    it("should create the member group with kind regular_auto", async () => {
      const result = await createSpaceAndGroup(adminAuth, {
        name: "Kind Check Space",
        isRestricted: true,
        spaceKind: "regular",
        managementMode: "manual",
        memberIds: [user1.sId],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const groups = await result.value.fetchGroupResources(adminAuth);
        const memberGroup = groups.find((g) =>
          g.name.startsWith("Group for space Kind Check Space")
        );
        expect(memberGroup).toBeDefined();
        expect(memberGroup?.kind).toBe("regular_auto");
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
        expect(await space.isRestricted(adminAuth)).toBe(true);

        // Verify groups were associated (from the space's group_permissions grants).
        const reloadedSpace = await SpaceResource.fetchById(
          adminAuth,
          space.sId
        );
        const associatedGroupIds = (
          await reloadedSpace!.fetchGrantReferences()
        ).map((group) => group.groupId);
        expect(associatedGroupIds).toContain(provisionedGroup.id);
      }
    });

    it("should create dust_project connector when creating a project space", async () => {
      // Mock createDataSourceAndConnectorForProject
      const createConnectorSpy = vi
        .spyOn(
          await import("@app/lib/api/projects/connector"),
          "createDataSourceAndConnectorForProject"
        )
        .mockResolvedValue(new Ok(undefined));

      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Project With Connector",
        isRestricted: false,
        spaceKind: "project",
        managementMode: "manual",
        memberIds: [],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const space = result.value;
        expect(space.kind).toBe("project");

        // Verify createDataSourceAndConnectorForProject was called with correct parameters
        expect(createConnectorSpy).toHaveBeenCalledTimes(1);
        const createConnectorCall = createConnectorSpy.mock.calls[0];
        expect(createConnectorCall[0]).toBe(adminAuth);
        expect(createConnectorCall[1]).toBe(space);
      }

      // Cleanup spy
      createConnectorSpy.mockRestore();
    });

    it("should not create connector when creating a regular space", async () => {
      const createConnectorSpy = vi.spyOn(
        await import("@app/lib/api/projects/connector"),
        "createDataSourceAndConnectorForProject"
      );

      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Regular Space No Connector",
        isRestricted: false,
        spaceKind: "regular",
        managementMode: "manual",
        memberIds: [],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const space = result.value;
        expect(space.kind).toBe("regular");

        // Verify connector was NOT created for regular spaces
        expect(createConnectorSpy).not.toHaveBeenCalled();

        // Verify no dust_project data source exists
        const dataSource = await DataSourceResource.fetchByNameOrId(
          adminAuth,
          getProjectConversationsDatasourceName(space)
        );
        expect(dataSource).toBeNull();
      }

      createConnectorSpy.mockRestore();
    });

    it("should add the creator to the project editor group", async () => {
      const createConnectorSpy = vi
        .spyOn(
          await import("@app/lib/api/projects/connector"),
          "createDataSourceAndConnectorForProject"
        )
        .mockResolvedValue(new Ok(undefined));

      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user1.sId,
        workspace.sId
      );
      const staleAuthJson = userAuth.toJSON();

      const result = await createSpaceAndGroup(userAuth, {
        name: "Test Project Creator Editor",
        isRestricted: true,
        spaceKind: "project",
        managementMode: "manual",
        memberIds: [],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const pod = result.value;
        const creator = userAuth.getNonNullableUser();
        const { groupsToProcess, allGroupMemberships, editorGroupModelId } =
          await pod.fetchManualGroupsMemberships(userAuth);
        const editorGroup = groupsToProcess.find(
          (group) => group.id === editorGroupModelId
        );

        expect(editorGroup).toBeDefined();
        expect(
          allGroupMemberships.some(
            (membership) =>
              membership.groupId === editorGroup!.id &&
              membership.userId === creator.id
          )
        ).toBe(true);

        const staleAuth = await Authenticator.fromJSON(staleAuthJson);
        expect(staleAuth.can("admin", pod)).toBe(false);
        expect(staleAuth.hasGroupByModelId(editorGroup!.id)).toBe(false);

        await staleAuth.refresh();
        expect(staleAuth.hasGroupByModelId(editorGroup!.id)).toBe(true);

        const refreshedPod = await SpaceResource.fetchById(staleAuth, pod.sId);
        expect(staleAuth.can("admin", refreshedPod!)).toBe(true);
      }

      createConnectorSpy.mockRestore();
    });

    it("refreshes the live creator auth so it can administrate the new project in the same request", async () => {
      const createConnectorSpy = vi
        .spyOn(
          await import("@app/lib/api/projects/connector"),
          "createDataSourceAndConnectorForProject"
        )
        .mockResolvedValue(new Ok(undefined));

      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user1.sId,
        workspace.sId
      );

      const result = await createSpaceAndGroup(userAuth, {
        name: "Test Project Live Auth Refresh",
        isRestricted: true,
        spaceKind: "project",
        managementMode: "manual",
        memberIds: [],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const pod = result.value;
        const { groupsToProcess, editorGroupModelId } =
          await pod.fetchManualGroupsMemberships(userAuth);
        const editorGroup = groupsToProcess.find(
          (group) => group.id === editorGroupModelId
        );
        expect(editorGroup).toBeDefined();

        // createSpaceAndGroup added the creator to the new editor group, wrote its grants, and
        // refreshed `userAuth` post-commit. The same live auth must now see the group and
        // administrate the pod with no manual refresh (contrast the reconstructed stale-auth test
        // above, which has to call refresh() itself).
        expect(userAuth.hasGroupByModelId(editorGroup!.id)).toBe(true);
        expect(userAuth.getGrantedVerbs("space", pod.id)).toContain("admin");
        expect(userAuth.can("admin", pod)).toBe(true);
      }

      createConnectorSpy.mockRestore();
    });

    it("should handle connector creation failure gracefully", async () => {
      // Mock createDataSourceAndConnectorForProject to fail
      const createConnectorError = new Error("Failed to create connector");
      const createConnectorSpy = vi
        .spyOn(
          await import("@app/lib/api/projects/connector"),
          "createDataSourceAndConnectorForProject"
        )
        .mockResolvedValue(new Err(createConnectorError));

      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Project Connector Failure",
        isRestricted: false,
        spaceKind: "project",
        managementMode: "manual",
        memberIds: [],
      });

      // Space creation should still succeed even if connector creation fails
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const space = result.value;
        expect(space.kind).toBe("project");

        // Verify connector creation was attempted
        expect(createConnectorSpy).toHaveBeenCalledTimes(1);
        const createConnectorCall = createConnectorSpy.mock.calls[0];
        expect(createConnectorCall[0]).toBe(adminAuth);
        expect(createConnectorCall[1]).toBe(space);
      }

      // Cleanup
      createConnectorSpy.mockRestore();
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
        const reloadedSpace = await SpaceResource.fetchById(
          adminAuth,
          space.sId
        );
        expect(reloadedSpace).not.toBeNull();
        expect(await reloadedSpace!.isRestricted(adminAuth)).toBe(false);

        // Verify global group was added (from the space's group_permissions grants).
        const associatedGroupIds = (
          await reloadedSpace!.fetchGrantReferences()
        ).map((group) => group.groupId);
        expect(associatedGroupIds).toContain(globalGroup.id);
      }
    });

    it("gives members of an open space write, and everyone else read only", async () => {
      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Open Space With Members",
        isRestricted: false,
        spaceKind: "regular",
        managementMode: "manual",
        memberIds: [user1.sId],
      });

      expect(result.isOk()).toBe(true);
      if (result.isErr()) {
        return;
      }

      // Auths are built after the space exists: they resolve their grants once, at construction.
      const memberAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user1.sId,
        workspace.sId
      );
      const nonMemberAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user2.sId,
        workspace.sId
      );

      const asMember = await SpaceResource.fetchById(
        memberAuth,
        result.value.sId
      );
      const asNonMember = await SpaceResource.fetchById(
        nonMemberAuth,
        result.value.sId
      );

      expect(await asMember!.isRestricted(memberAuth)).toBe(false);

      // The member group confers write; the global group's `reader` grant only confers read.
      expect(memberAuth.can("read", asMember!)).toBe(true);
      expect(memberAuth.can("write", asMember!)).toBe(true);

      expect(nonMemberAuth.can("read", asNonMember!)).toBe(true);
      expect(nonMemberAuth.can("write", asNonMember!)).toBe(false);
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
        expect(await space.isRestricted(adminAuth)).toBe(true);

        // Verify global group was NOT added (from the space's group_permissions grants).
        const associatedGroupIds = (await space.fetchGrantReferences()).map(
          (group) => group.groupId
        );
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
        const regularSpaces = allSpaces.filter((s) => s.kind === "regular");
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
        const regularSpaces = allSpaces.filter((s) => s.kind === "regular");
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

    it("should allow creating a project when workspace limit is reached", async () => {
      const plan = adminAuth.getNonNullablePlan();
      const originalMaxVaults = plan.limits.vaults.maxVaults;

      const testMaxVaults = 3;
      plan.limits.vaults.maxVaults = testMaxVaults;

      const createConnectorSpy = vi
        .spyOn(
          await import("@app/lib/api/projects/connector"),
          "createDataSourceAndConnectorForProject"
        )
        .mockResolvedValue(new Ok(undefined));

      try {
        const allSpaces = await SpaceResource.listWorkspaceSpaces(
          adminAuth,
          undefined
        );
        const regularSpaces = allSpaces.filter((s) => s.kind === "regular");
        const spacesToCreate = Math.max(
          0,
          testMaxVaults - regularSpaces.length
        );

        for (let i = 0; i < spacesToCreate; i++) {
          const result = await createSpaceAndGroup(
            adminAuth,
            {
              name: `Limit Test Space ${i}`,
              isRestricted: true,
              spaceKind: "regular",
              managementMode: "manual",
              memberIds: [],
            },
            { ignoreWorkspaceLimit: false }
          );
          expect(result.isOk()).toBe(true);
        }

        // Creating another regular space should fail
        const limitResult = await createSpaceAndGroup(adminAuth, {
          name: "Would Exceed Limit",
          isRestricted: true,
          spaceKind: "regular",
          managementMode: "manual",
          memberIds: [],
        });
        expect(limitResult.isErr()).toBe(true);
        if (limitResult.isErr()) {
          expect(limitResult.error).toBeInstanceOf(DustError);
          expect(limitResult.error.code).toBe("limit_reached");
        }

        // Creating a project should still succeed (limit is not checked for projects)
        const projectResult = await createSpaceAndGroup(adminAuth, {
          name: "Project When At Limit",
          isRestricted: false,
          spaceKind: "project",
          managementMode: "manual",
          memberIds: [],
        });
        expect(projectResult.isOk()).toBe(true);
        if (projectResult.isOk()) {
          expect(projectResult.value.kind).toBe("project");
          expect(projectResult.value.name).toBe("Project When At Limit");
        }
      } finally {
        plan.limits.vaults.maxVaults = originalMaxVaults;
        createConnectorSpy.mockRestore();
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

      // The function trims the name before saving
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.name).toBe("Trimmed Space Name");
      }
    });

    it("should prevent duplicate space names (case-insensitive)", async () => {
      // Create first space
      const firstResult = await createSpaceAndGroup(
        adminAuth,
        {
          name: "Test Space",
          isRestricted: true,
          spaceKind: "regular",
          managementMode: "manual",
          memberIds: [],
        },
        { ignoreWorkspaceLimit: true }
      );
      expect(firstResult.isOk()).toBe(true);

      // Try to create another space with same name but different case
      const duplicateResult = await createSpaceAndGroup(
        adminAuth,
        {
          name: "test space",
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
      }
    });

    it("should prevent duplicate space names with leading/trailing whitespace", async () => {
      // Create first space
      const firstResult = await createSpaceAndGroup(
        adminAuth,
        {
          name: "Whitespace Test",
          isRestricted: true,
          spaceKind: "regular",
          managementMode: "manual",
          memberIds: [],
        },
        { ignoreWorkspaceLimit: true }
      );
      expect(firstResult.isOk()).toBe(true);

      // Try to create another space with same name but with whitespace
      const duplicateResult = await createSpaceAndGroup(
        adminAuth,
        {
          name: "  Whitespace Test  ",
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
        const reloadedSpace = await SpaceResource.fetchById(
          adminAuth,
          space.sId
        );
        const associatedGroupIds = (
          await reloadedSpace!.fetchGrantReferences()
        ).map((group) => group.groupId);
        expect(associatedGroupIds).toContain(provisionedGroup1.id);
        expect(associatedGroupIds).toContain(provisionedGroup2.id);
      }
    });

    it("should grant the global group reader on unrestricted regular spaces", async () => {
      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Unrestricted Regular Space",
        isRestricted: false,
        spaceKind: "regular",
        managementMode: "manual",
        memberIds: [],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const space = result.value;
        const reloadedSpace = await SpaceResource.fetchById(
          adminAuth,
          space.sId
        );
        expect(await reloadedSpace!.isRestricted(adminAuth)).toBe(false);

        // Verify the global group holds a reader grant on the space (open regular space).
        const grants = await GroupPermissionResource.listForResource(
          adminAuth,
          { resourceType: "space", resourceId: reloadedSpace!.id }
        );
        const globalGrant = grants.find((g) => g.groupId === globalGroup.id);
        expect(globalGrant).toBeDefined();
        expect(globalGrant?.grantType).toBe("reader");
      }
    });

    it("should grant the global group reader on unrestricted project spaces", async () => {
      vi.spyOn(
        await import("@app/lib/api/projects/connector"),
        "createDataSourceAndConnectorForProject"
      ).mockResolvedValue(new Ok(undefined));

      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Unrestricted Project Space",
        isRestricted: false,
        spaceKind: "project",
        managementMode: "manual",
        memberIds: [],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const space = result.value;
        const reloadedSpace = await SpaceResource.fetchById(
          adminAuth,
          space.sId
        );
        expect(reloadedSpace!.kind).toBe("project");
        expect(await reloadedSpace!.isRestricted(adminAuth)).toBe(false);

        // Verify the global group holds a reader grant on the project (attached as viewer).
        const grants = await GroupPermissionResource.listForResource(
          adminAuth,
          { resourceType: "space", resourceId: reloadedSpace!.id }
        );
        const globalGrant = grants.find((g) => g.groupId === globalGroup.id);
        expect(globalGrant).toBeDefined();
        expect(globalGrant?.grantType).toBe("reader");
      }
    });
  });

  describe("project metadata lifecycle", () => {
    it("creates metadata for project spaces, not for regular spaces", async () => {
      vi.spyOn(
        await import("@app/lib/api/projects/connector"),
        "createDataSourceAndConnectorForProject"
      ).mockResolvedValue(new Ok(undefined));

      const projectResult = await createSpaceAndGroup(adminAuth, {
        name: "Test Project",
        isRestricted: false,
        spaceKind: "project",
        managementMode: "manual",
        memberIds: [],
      });
      expect(projectResult.isOk()).toBe(true);
      if (projectResult.isOk()) {
        const projectMetadata = await ProjectMetadataResource.fetchBySpace(
          adminAuth,
          projectResult.value
        );
        expect(projectMetadata).not.toBeNull();
      }

      const regularResult = await createSpaceAndGroup(adminAuth, {
        name: "Test Regular",
        isRestricted: true,
        spaceKind: "regular",
        managementMode: "manual",
        memberIds: [],
      });
      expect(regularResult.isOk()).toBe(true);
      if (regularResult.isOk()) {
        const regularMetadata = await ProjectMetadataResource.fetchBySpace(
          adminAuth,
          regularResult.value
        );
        expect(regularMetadata).toBeNull();
      }
    });
  });
});

describe("softDeleteSpaceAndLaunchScrubWorkflow", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let adminAuth: Authenticator;
  let globalGroup: GroupResource;
  let systemGroup: GroupResource;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    const adminUser = await UserFactory.basic();

    // Set up default groups and spaces FIRST (before creating authenticators)
    const { globalGroup: gGroup, systemGroup: sGroup } =
      await GroupFactory.defaults(workspace);
    globalGroup = gGroup;
    systemGroup = sGroup;

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

    // Mock launchScrubSpaceWorkflow to prevent actual workflow execution
    vi.mock("@app/poke/temporal/client", () => ({
      launchScrubSpaceWorkflow: vi.fn().mockResolvedValue(undefined),
    }));
  });

  describe("space type validation", () => {
    // This test ensures that if a new space kind is added to SPACE_KINDS,
    // it will fail by default unless explicitly added to the allowed list
    it("should only allow deleting 'regular' and 'project' space kinds", () => {
      const allowedKinds = ["regular", "project"];
      const allKinds = [...SPACE_KINDS];

      // This assertion will fail if new space kinds are added to SPACE_KINDS
      // without being explicitly handled in this test or in the deletion logic
      const unhandledKinds = allKinds.filter(
        (kind) => !allowedKinds.includes(kind)
      );

      // Document which kinds are NOT allowed to be deleted
      const knownDisallowedKinds = ["global", "system", "conversations"];

      expect(unhandledKinds.sort()).toEqual(knownDisallowedKinds.sort());
    });

    it("should fail to delete a global space", async () => {
      const spaces = await SpaceResource.listWorkspaceSpaces(adminAuth);
      const globalSpace = spaces.find((s) => s.isGlobal());
      expect(globalSpace).toBeDefined();

      await expect(async () => {
        await softDeleteSpaceAndLaunchScrubWorkflow(
          adminAuth,
          globalSpace!,
          false
        );
      }).rejects.toThrow(
        "Cannot delete spaces that are not regular or project"
      );
    });

    it("should fail to delete a system space", async () => {
      const spaces = await SpaceResource.listWorkspaceSpaces(adminAuth);
      const systemSpace = spaces.find((s) => s.isSystem());
      expect(systemSpace).toBeDefined();

      await expect(async () => {
        await softDeleteSpaceAndLaunchScrubWorkflow(
          adminAuth,
          systemSpace!,
          false
        );
      }).rejects.toThrow(
        "Cannot delete spaces that are not regular or project"
      );
    });

    it("should fail to delete a conversations space", async () => {
      const spaces = await SpaceResource.listWorkspaceSpaces(adminAuth, {
        includeConversationsSpace: true,
      });
      const conversationsSpace = spaces.find((s) => s.isConversations());
      expect(conversationsSpace).toBeDefined();

      await expect(async () => {
        await softDeleteSpaceAndLaunchScrubWorkflow(
          adminAuth,
          conversationsSpace!,
          false
        );
      }).rejects.toThrow(
        "Cannot delete spaces that are not regular or project"
      );
    });
  });

  describe("API key validation", () => {
    it("should be able to delete a regular space with active API keys in non-global groups", async () => {
      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Regular Space With Keys",
        isRestricted: true,
        spaceKind: "regular",
        managementMode: "manual",
        memberIds: [],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const space = result.value;
        // Get the space's non-global group
        const spaceGroup = await fetchNonGlobalGroup(space, adminAuth);
        expect(spaceGroup).toBeDefined();

        // Create an active API key for the space group
        if (spaceGroup) {
          await KeyFactory.regular(spaceGroup);

          const deleteResult = await softDeleteSpaceAndLaunchScrubWorkflow(
            adminAuth,
            space,
            false
          );
          expect(deleteResult.isOk()).toBe(true);
        }
      }
    });

    it("should be able to delete a project space with active API keys in non-global groups", async () => {
      vi.spyOn(
        await import("@app/lib/api/projects/connector"),
        "createDataSourceAndConnectorForProject"
      ).mockResolvedValue(new Ok(undefined));

      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Project Space With Keys",
        isRestricted: true,
        spaceKind: "project",
        managementMode: "manual",
        memberIds: [],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const space = result.value;
        // Get the space's non-global group
        const spaceGroup = await fetchNonGlobalGroup(space, adminAuth);
        expect(spaceGroup).toBeDefined();

        // Create an active API key for the space group
        if (spaceGroup) {
          await KeyFactory.regular(spaceGroup);

          const deleteResult = await softDeleteSpaceAndLaunchScrubWorkflow(
            adminAuth,
            space,
            false
          );
          expect(deleteResult.isOk()).toBe(true);
        }
      }
    });

    it("should allow deleting a regular space with disabled API keys", async () => {
      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Regular Space With Disabled Keys",
        isRestricted: true,
        spaceKind: "regular",
        managementMode: "manual",
        memberIds: [],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const space = result.value;
        // Get the space's non-global group
        const spaceGroup = await fetchNonGlobalGroup(space, adminAuth);
        expect(spaceGroup).toBeDefined();

        // Create a disabled API key for the space group
        if (spaceGroup) {
          await KeyFactory.disabled(spaceGroup);

          const deleteResult = await softDeleteSpaceAndLaunchScrubWorkflow(
            adminAuth,
            space,
            false
          );
          expect(deleteResult.isOk()).toBe(true);
        }
      }
    });

    it("should allow deleting a regular space with active API keys in global group", async () => {
      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Regular Space With Global Keys",
        isRestricted: false,
        spaceKind: "regular",
        managementMode: "manual",
        memberIds: [],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const space = result.value;
        const reloadedSpace = await SpaceResource.fetchById(
          adminAuth,
          space.sId
        );
        // Verify the space has the global group
        expect(
          (await reloadedSpace!.fetchGrantReferences()).some((g) =>
            g.isReader()
          )
        ).toBe(true);

        // Create an active API key for the global group
        await KeyFactory.regular(globalGroup);

        // Should succeed because keys in global group are allowed for spaces
        const deleteResult = await softDeleteSpaceAndLaunchScrubWorkflow(
          adminAuth,
          reloadedSpace!,
          false
        );
        expect(deleteResult.isOk()).toBe(true);
      }
    });

    it("should allow deleting a project space with active API keys in global group", async () => {
      vi.spyOn(
        await import("@app/lib/api/projects/connector"),
        "createDataSourceAndConnectorForProject"
      ).mockResolvedValue(new Ok(undefined));

      const result = await createSpaceAndGroup(adminAuth, {
        name: "Test Project Space With Global Keys",
        isRestricted: false,
        spaceKind: "project",
        managementMode: "manual",
        memberIds: [],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const space = result.value;
        const reloadedSpace = await SpaceResource.fetchById(
          adminAuth,
          space.sId
        );
        // Verify the space has the global group
        expect(
          (await reloadedSpace!.fetchGrantReferences()).some((g) =>
            g.isReader()
          )
        ).toBe(true);

        // Create an active API key for the global group
        await KeyFactory.regular(globalGroup);

        // Should succeed because keys in global group are allowed for unrestricted spaces
        const deleteResult = await softDeleteSpaceAndLaunchScrubWorkflow(
          adminAuth,
          reloadedSpace!,
          false
        );
        expect(deleteResult.isOk()).toBe(true);
      }
    });
  });

  describe("usage guard", () => {
    it("blocks deletion and names the skill when only a skill uses the space's data, not an agent", async () => {
      const spaceResult = await createSpaceAndGroup(
        adminAuth,
        {
          name: "Test Space With Skill Knowledge",
          isRestricted: false,
          spaceKind: "regular",
          managementMode: "manual",
          memberIds: [],
        },
        { ignoreWorkspaceLimit: true }
      );
      expect(spaceResult.isOk()).toBe(true);
      const space = spaceResult.isOk() ? spaceResult.value : null;
      expect(space).not.toBeNull();

      const view = await DataSourceViewFactory.folder(workspace, space!);
      const skill = await SkillFactory.create(adminAuth, {
        name: "Space Knowledge Skill",
        availability: "workspace_users",
        attachedKnowledge: [{ dataSourceView: view, nodeId: "node-1" }],
      });

      const deleteResult = await softDeleteSpaceAndLaunchScrubWorkflow(
        adminAuth,
        space!,
        false // do not force — the guard should block
      );

      expect(deleteResult.isErr()).toBe(true);
      if (deleteResult.isErr()) {
        expect(deleteResult.error.message).toContain(skill.name);
      }
    });
  });

  describe("requestedSpaceIds cleanup", () => {
    it("should remove deleted space from skill requestedSpaceIds", async () => {
      // Create a non-restricted regular space (accessible via global group)
      const spaceResult = await createSpaceAndGroup(
        adminAuth,
        {
          name: "Test Space With Tool",
          isRestricted: false,
          spaceKind: "regular",
          managementMode: "manual",
          memberIds: [],
        },
        { ignoreWorkspaceLimit: true }
      );
      expect(spaceResult.isOk()).toBe(true);
      const space = spaceResult.isOk() ? spaceResult.value : null;
      expect(space).not.toBeNull();

      // Create an MCP server and view in the space
      const server = await RemoteMCPServerFactory.create(workspace, {
        name: "Test Server",
      });
      const serverView = await MCPServerViewFactory.create(
        workspace,
        server.sId,
        space!
      );

      // Create a skill with the space in requestedSpaceIds and the MCP server view
      const skill = await SkillFactory.create(adminAuth, {
        name: "Test Skill With Tool",
        requestedSpaceIds: [space!.id],
        mcpServerViews: [serverView],
      });

      // Verify the skill has the space in its requestedSpaceIds
      const skillBefore = await SkillResource.fetchById(adminAuth, skill.sId);
      expect(skillBefore).not.toBeNull();
      expect(skillBefore!.requestedSpaceIds).toContain(space!.id);

      // Delete the space
      const deleteResult = await softDeleteSpaceAndLaunchScrubWorkflow(
        adminAuth,
        space!,
        true // force delete
      );
      expect(deleteResult.isOk()).toBe(true);

      const skillAfter = await SkillResource.fetchById(adminAuth, skill.sId);
      expect(skillAfter).not.toBeNull();
      expect(skillAfter!.requestedSpaceIds).not.toContain(space!.id);
      expect(skillAfter!.requestedSpaceIds).toHaveLength(0);
    });

    it("should remove a deleted space from a skill's manually requested spaces", async () => {
      // A manual selection survives everything else, but not the space going away: an id pointing
      // at a missing space makes the skill unreadable for everyone.
      const spaceResult = await createSpaceAndGroup(
        adminAuth,
        {
          name: "Manually Selected Space",
          isRestricted: false,
          spaceKind: "regular",
          managementMode: "manual",
          memberIds: [],
        },
        { ignoreWorkspaceLimit: true }
      );
      expect(spaceResult.isOk()).toBe(true);
      const space = spaceResult.isOk() ? spaceResult.value : null;
      expect(space).not.toBeNull();

      const skill = await SkillFactory.create(adminAuth, {
        name: "Skill With Manual Space",
        requestedSpaceIds: [space!.id],
        manuallyRequestedSpaceIds: [space!.id],
      });

      const deleteResult = await softDeleteSpaceAndLaunchScrubWorkflow(
        adminAuth,
        space!,
        true // force delete
      );
      expect(deleteResult.isOk()).toBe(true);

      const skillAfter = await SkillResource.fetchById(adminAuth, skill.sId);
      expect(skillAfter).not.toBeNull();
      expect(skillAfter!.manuallyRequestedSpaceIds).not.toContain(space!.id);
      expect(skillAfter!.requestedSpaceIds).not.toContain(space!.id);
    });

    it("should clean an archived skill's requestedSpaceIds too", async () => {
      // An archived skill keeps its references, and a dangling one makes it unfetchable — so it
      // could never be restored. The cleanup must not be limited to active skills.
      const spaceResult = await createSpaceAndGroup(
        adminAuth,
        {
          name: "Test Space With Archived Skill",
          isRestricted: false,
          spaceKind: "regular",
          managementMode: "manual",
          memberIds: [],
        },
        { ignoreWorkspaceLimit: true }
      );
      expect(spaceResult.isOk()).toBe(true);
      const space = spaceResult.isOk() ? spaceResult.value : null;
      expect(space).not.toBeNull();

      const skill = await SkillFactory.create(adminAuth, {
        name: "Archived Skill Referencing A Space",
        requestedSpaceIds: [space!.id],
      });
      await skill.archive(adminAuth);

      const deleteResult = await softDeleteSpaceAndLaunchScrubWorkflow(
        adminAuth,
        space!,
        true // force delete
      );
      expect(deleteResult.isOk()).toBe(true);

      // `fetchById` and friends default to active skills, so read it back as archived.
      const archivedSkills = await SkillResource.listByWorkspace(adminAuth, {
        status: "archived",
      });
      const skillAfter = archivedSkills.find((s) => s.id === skill.id);
      expect(skillAfter).toBeDefined();
      expect(skillAfter!.requestedSpaceIds).not.toContain(space!.id);
    });

    it("should preserve additional skill requestedSpaceIds when deleting a dependency space", async () => {
      const toolSpaceResult = await createSpaceAndGroup(
        adminAuth,
        {
          name: "Test Space With Tool",
          isRestricted: false,
          spaceKind: "regular",
          managementMode: "manual",
          memberIds: [],
        },
        { ignoreWorkspaceLimit: true }
      );
      expect(toolSpaceResult.isOk()).toBe(true);
      const toolSpace = toolSpaceResult.isOk() ? toolSpaceResult.value : null;

      const additionalSpaceResult = await createSpaceAndGroup(
        adminAuth,
        {
          name: "Test Additional Skill Space",
          isRestricted: false,
          spaceKind: "regular",
          managementMode: "manual",
          memberIds: [],
        },
        { ignoreWorkspaceLimit: true }
      );
      expect(additionalSpaceResult.isOk()).toBe(true);
      const additionalSpace = additionalSpaceResult.isOk()
        ? additionalSpaceResult.value
        : null;

      const server = await RemoteMCPServerFactory.create(workspace, {
        name: "Test Server",
      });
      const serverView = await MCPServerViewFactory.create(
        workspace,
        server.sId,
        toolSpace!
      );

      const skill = await SkillFactory.create(adminAuth, {
        name: "Test Skill With Tool And Additional Space",
        requestedSpaceIds: [toolSpace!.id, additionalSpace!.id],
        // Only the additional space was picked by hand; the tool space comes from the server view.
        manuallyRequestedSpaceIds: [additionalSpace!.id],
        mcpServerViews: [serverView],
      });

      const deleteResult = await softDeleteSpaceAndLaunchScrubWorkflow(
        adminAuth,
        toolSpace!,
        true
      );
      expect(deleteResult.isOk()).toBe(true);

      const skillAfter = await SkillResource.fetchById(adminAuth, skill.sId);
      expect(skillAfter).not.toBeNull();
      expect(skillAfter!.requestedSpaceIds).not.toContain(toolSpace!.id);
      expect(skillAfter!.requestedSpaceIds).toEqual([additionalSpace!.id]);
    });

    it("should preserve a nested skill's spaces when deleting a dependency space", async () => {
      // The parent requests two spaces for two different reasons: a tool of its own, and a child
      // skill it references. Deleting the tool's space must not drop the child's.
      const toolSpaceResult = await createSpaceAndGroup(
        adminAuth,
        {
          name: "Test Space With Parent Tool",
          isRestricted: false,
          spaceKind: "regular",
          managementMode: "manual",
          memberIds: [],
        },
        { ignoreWorkspaceLimit: true }
      );
      expect(toolSpaceResult.isOk()).toBe(true);
      const toolSpace = toolSpaceResult.isOk() ? toolSpaceResult.value : null;

      const childSpaceResult = await createSpaceAndGroup(
        adminAuth,
        {
          name: "Test Space With Child Tool",
          isRestricted: false,
          spaceKind: "regular",
          managementMode: "manual",
          memberIds: [],
        },
        { ignoreWorkspaceLimit: true }
      );
      expect(childSpaceResult.isOk()).toBe(true);
      const childSpace = childSpaceResult.isOk()
        ? childSpaceResult.value
        : null;

      const server = await RemoteMCPServerFactory.create(workspace, {
        name: "Test Server",
      });
      const parentServerView = await MCPServerViewFactory.create(
        workspace,
        server.sId,
        toolSpace!
      );
      const childServerView = await MCPServerViewFactory.create(
        workspace,
        server.sId,
        childSpace!
      );

      const { parentSkill } = await SkillFactory.createWithNestedSkill(
        adminAuth,
        {
          childOverrides: {
            name: "Nested Child Skill",
            requestedSpaceIds: [childSpace!.id],
            mcpServerViews: [childServerView],
          },
          parentOverrides: {
            name: "Nested Parent Skill",
            requestedSpaceIds: [toolSpace!.id, childSpace!.id],
            mcpServerViews: [parentServerView],
          },
        }
      );

      const deleteResult = await softDeleteSpaceAndLaunchScrubWorkflow(
        adminAuth,
        toolSpace!,
        true // force delete
      );
      expect(deleteResult.isOk()).toBe(true);

      const parentAfter = await SkillResource.fetchById(
        adminAuth,
        parentSkill.sId
      );
      expect(parentAfter).not.toBeNull();
      expect(parentAfter!.requestedSpaceIds).not.toContain(toolSpace!.id);
      // Requested through the child skill reference, not by hand.
      expect(parentAfter!.requestedSpaceIds).toContain(childSpace!.id);
      expect(parentAfter!.manuallyRequestedSpaceIds).toEqual([]);
    });

    it("should only remove deleted space from agent requestedSpaceIds, keeping other spaces", async () => {
      // Create two non-restricted regular spaces (accessible via global group)
      const space1Result = await createSpaceAndGroup(
        adminAuth,
        {
          name: "Test Space 1",
          isRestricted: false,
          spaceKind: "regular",
          managementMode: "manual",
          memberIds: [],
        },
        { ignoreWorkspaceLimit: true }
      );
      expect(space1Result.isOk()).toBe(true);
      const space1 = space1Result.isOk() ? space1Result.value : null;

      const space2Result = await createSpaceAndGroup(
        adminAuth,
        {
          name: "Test Space 2",
          isRestricted: false,
          spaceKind: "regular",
          managementMode: "manual",
          memberIds: [],
        },
        { ignoreWorkspaceLimit: true }
      );
      expect(space2Result.isOk()).toBe(true);
      const space2 = space2Result.isOk() ? space2Result.value : null;

      // Create an agent with both spaces in requestedSpaceIds
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        adminAuth,
        {
          name: "Test Agent With Two Spaces",
        }
      );

      // Update the agent's requestedSpaceIds to include both spaces
      await AgentConfigurationModel.update(
        {
          requestedSpaceIds: [space1!.id, space2!.id],
        },
        {
          where: {
            id: agentConfig.id,
            workspaceId: workspace.id,
          },
        }
      );

      // Verify the agent has both spaces in its requestedSpaceIds (using sIds)
      const agentsBefore = await getAgentConfigurations(adminAuth, {
        agentIds: [agentConfig.sId],
        variant: "light",
      });
      expect(agentsBefore).toHaveLength(1);
      expect(agentsBefore[0].requestedSpaceIds).toHaveLength(2);
      expect(agentsBefore[0].requestedSpaceIds).toContain(space1!.sId);
      expect(agentsBefore[0].requestedSpaceIds).toContain(space2!.sId);

      // Delete space1
      const deleteResult = await softDeleteSpaceAndLaunchScrubWorkflow(
        adminAuth,
        space1!,
        true // force delete
      );
      expect(deleteResult.isOk()).toBe(true);

      // Verify the agent's requestedSpaceIds no longer contains space1 but still has space2
      const agentsAfter = await getAgentConfigurations(adminAuth, {
        agentIds: [agentConfig.sId],
        variant: "light",
      });
      expect(agentsAfter).toHaveLength(1);
      expect(agentsAfter[0].requestedSpaceIds).toHaveLength(1);
      expect(agentsAfter[0].requestedSpaceIds).toContain(space2!.sId);
      expect(agentsAfter[0].requestedSpaceIds).not.toContain(space1!.sId);
    });
  });
});
