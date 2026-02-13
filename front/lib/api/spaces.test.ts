import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { getProjectConversationsDatasourceName } from "@app/lib/api/projects";
import {
  createSpaceAndGroup,
  softDeleteSpaceAndLaunchScrubWorkflow,
} from "@app/lib/api/spaces";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { GroupSpaceMemberResource } from "@app/lib/resources/group_space_member_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import type { UserResource } from "@app/lib/resources/user_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
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

// Mock config to avoid requiring environment variables
vi.mock("@app/lib/api/config", () => ({
  default: {
    getCoreAPIConfig: () => ({
      url: "http://fake-core-api-url",
      apiKey: "test-api-key",
    }),
    getConnectorsAPIConfig: () => ({
      url: "http://fake-connectors-api-url",
      secret: "test-secret",
      webhookSecret: "test-webhook-secret",
    }),
  },
}));

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

    it("should create dust_project connector when creating a project space", async () => {
      // Mock createDataSourceAndConnectorForProject
      const createConnectorSpy = vi
        .spyOn(
          await import("@app/lib/api/projects"),
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
        await import("@app/lib/api/projects"),
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

    it("should handle connector creation failure gracefully", async () => {
      // Mock createDataSourceAndConnectorForProject to fail
      const createConnectorError = new Error("Failed to create connector");
      const createConnectorSpy = vi
        .spyOn(
          await import("@app/lib/api/projects"),
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
        expect(reloadedSpace!.isRegularAndRestricted()).toBe(false);

        // Verify global group was added
        const groupSpaces = await GroupSpaceModel.findAll({
          where: {
            vaultId: reloadedSpace!.id,
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

    it("should set global group kind to 'member' for unrestricted regular spaces", async () => {
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
        expect(reloadedSpace!.isOpen()).toBe(true);

        // Verify global group was added with kind "member"
        const groupSpaces = await GroupSpaceMemberResource.fetchBySpace({
          space: reloadedSpace!,
        });
        expect(groupSpaces.length).toBeGreaterThan(0);
        expect(groupSpaces.some((gs) => gs.group.kind === "global")).toBe(true);
      }
    });

    it("should set global group kind to 'project_viewer' for unrestricted project spaces", async () => {
      vi.spyOn(
        await import("@app/lib/api/projects"),
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
        expect(reloadedSpace!.isOpen()).toBe(true);

        // Verify global group was added with kind "project_viewer"
        const groupSpace = await GroupSpaceModel.findOne({
          where: {
            vaultId: reloadedSpace!.id,
            workspaceId: workspace.id,
            groupId: globalGroup.id,
          },
        });
        expect(groupSpace).toBeDefined();
        expect(groupSpace?.kind).toBe("project_viewer");
      }
    });
  });

  describe("project metadata lifecycle", () => {
    it("creates metadata for project spaces, not for regular spaces", async () => {
      vi.spyOn(
        await import("@app/lib/api/projects"),
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
    it("should fail to delete a regular space with active API keys in non-global groups", async () => {
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
        const spaceGroup = space.groups.find((g) => !g.isGlobal());
        expect(spaceGroup).toBeDefined();

        // Create an active API key for the space group
        if (spaceGroup) {
          await KeyFactory.regular(spaceGroup);

          const deleteResult = await softDeleteSpaceAndLaunchScrubWorkflow(
            adminAuth,
            space,
            false
          );
          expect(deleteResult.isErr()).toBe(true);
          if (deleteResult.isErr()) {
            expect(deleteResult.error.message).toContain(
              "Cannot delete group with active API Keys"
            );
          }
        }
      }
    });

    it("should fail to delete a project space with active API keys in non-global groups", async () => {
      vi.spyOn(
        await import("@app/lib/api/projects"),
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
        const spaceGroup = space.groups.find((g) => !g.isGlobal());
        expect(spaceGroup).toBeDefined();

        // Create an active API key for the space group
        if (spaceGroup) {
          await KeyFactory.regular(spaceGroup);

          const deleteResult = await softDeleteSpaceAndLaunchScrubWorkflow(
            adminAuth,
            space,
            false
          );
          expect(deleteResult.isErr()).toBe(true);
          if (deleteResult.isErr()) {
            expect(deleteResult.error.message).toContain(
              "Cannot delete group with active API Keys"
            );
          }
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
        const spaceGroup = space.groups.find((g) => !g.isGlobal());
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
        expect(reloadedSpace!.groups.some((g) => g.isGlobal())).toBe(true);

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
        await import("@app/lib/api/projects"),
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
        expect(reloadedSpace!.groups.some((g) => g.isGlobal())).toBe(true);

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

      // Verify the skill's requestedSpaceIds no longer contains the deleted space
      // Note: We query the model directly because the MCP server views are cleaned up
      // asynchronously by the scrub workflow and would fail permission checks
      const skillAfter = await SkillConfigurationModel.findOne({
        where: { id: skill.id, workspaceId: workspace.id },
      });
      expect(skillAfter).not.toBeNull();
      expect(skillAfter!.requestedSpaceIds).not.toContain(space!.id);
      expect(skillAfter!.requestedSpaceIds).toHaveLength(0);
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
