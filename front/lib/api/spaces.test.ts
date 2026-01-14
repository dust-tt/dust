import { beforeEach, describe, expect, it, vi } from "vitest";

import { getProjectConversationsDatasourceName } from "@app/lib/api/project_connectors";
import { createSpaceAndGroup } from "@app/lib/api/spaces";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupSpaceModel } from "@app/lib/resources/storage/models/group_spaces";
import type { UserResource } from "@app/lib/resources/user_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { ConnectorsAPI, CoreAPI, Ok } from "@app/types";

// Mock config to avoid requiring environment variables
vi.mock("@app/lib/api/config", () => ({
  default: {
    getCoreAPIConfig: () => ({
      url: "http://localhost:3001",
      apiKey: "test-api-key",
    }),
    getConnectorsAPIConfig: () => ({
      url: "http://localhost:3002",
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

    it("should create dust_project connector when creating a project space", async () => {
      // Mock CoreAPI methods
      const mockProjectId = Math.floor(Math.random() * 1000000);
      const mockDataSourceId = "test-data-source-id-" + Math.random();

      const createProjectSpy = vi
        .spyOn(CoreAPI.prototype, "createProject")
        .mockResolvedValue(
          new Ok({
            project: {
              project_id: mockProjectId,
            },
          })
        );

      const createDataSourceSpy = vi
        .spyOn(CoreAPI.prototype, "createDataSource")
        .mockResolvedValue(
          new Ok({
            data_source: {
              created: Date.now(),
              data_source_id: mockDataSourceId,
              data_source_internal_id: `internal-${mockDataSourceId}`,
              name: getProjectConversationsDatasourceName(0), // Will be updated in actual call
              config: {
                embedder_config: {
                  embedder: {
                    provider_id: "openai",
                    model_id: "text-embedding-ada-002",
                    splitter_id: "base_v0",
                    max_chunk_size: 512,
                  },
                },
                qdrant_config: {
                  cluster: "cluster-0",
                  shadow_write_cluster: null,
                },
              },
            },
          })
        );

      // Mock ConnectorsAPI methods
      const mockConnectorId = "test-connector-id-" + Math.random();
      const mockWorkflowId = "test-workflow-id-" + Math.random();

      const createConnectorSpy = vi
        .spyOn(ConnectorsAPI.prototype, "createConnector")
        .mockResolvedValue(
          new Ok({
            id: mockConnectorId,
            type: "dust_project",
            workspaceId: workspace.sId,
            dataSourceId: "test-data-source-id",
            connectionId: "test-connection-id",
            useProxy: false,
            configuration: null,
            updatedAt: Date.now(),
          })
        );

      const syncConnectorSpy = vi
        .spyOn(ConnectorsAPI.prototype, "syncConnector")
        .mockResolvedValue(
          new Ok({
            workflowId: mockWorkflowId,
          })
        );

      // Mock getOrCreateSystemApiKey - create a real KeyResource
      const mockSystemKey = await KeyFactory.system(globalGroup);
      const getSystemKeySpy = vi
        .spyOn(await import("@app/lib/auth"), "getOrCreateSystemApiKey")
        .mockResolvedValue(new Ok(mockSystemKey));

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

        // Verify CoreAPI.createProject was called
        expect(createProjectSpy).toHaveBeenCalledTimes(1);

        // Verify CoreAPI.createDataSource was called with correct parameters
        expect(createDataSourceSpy).toHaveBeenCalledTimes(1);
        const createDataSourceCall = createDataSourceSpy.mock.calls[0][0];
        expect(createDataSourceCall.projectId).toBe(mockProjectId.toString());
        expect(createDataSourceCall.name).toBe(
          getProjectConversationsDatasourceName(space.id)
        );

        // Verify ConnectorsAPI.createConnector was called with correct parameters
        expect(createConnectorSpy).toHaveBeenCalledTimes(1);
        const createConnectorCall = createConnectorSpy.mock.calls[0][0];
        expect(createConnectorCall.provider).toBe("dust_project");
        expect(createConnectorCall.workspaceId).toBe(workspace.sId);
        expect(createConnectorCall.workspaceAPIKey).toBe(mockSystemKey.secret);
        expect(createConnectorCall.connectionId).toBe(space.sId);

        // Verify ConnectorsAPI.syncConnector was called to trigger initial sync
        expect(syncConnectorSpy).toHaveBeenCalledTimes(1);
        expect(syncConnectorSpy).toHaveBeenCalledWith(mockConnectorId);

        // Verify getOrCreateSystemApiKey was called
        expect(getSystemKeySpy).toHaveBeenCalledTimes(1);
        // getOrCreateSystemApiKey is called with the workspace object
        expect(getSystemKeySpy.mock.calls[0][0].sId).toBe(workspace.sId);

        // Verify data source was created and linked to connector
        const dataSource = await DataSourceResource.fetchByNameOrId(
          adminAuth,
          getProjectConversationsDatasourceName(space.id)
        );
        expect(dataSource).toBeDefined();
        expect(dataSource?.connectorProvider).toBe("dust_project");
        expect(dataSource?.connectorId?.toString()).toBe(mockConnectorId);
        expect(dataSource?.name).toBe(
          getProjectConversationsDatasourceName(space.id)
        );
      }

      // Cleanup spies
      createProjectSpy.mockRestore();
      createDataSourceSpy.mockRestore();
      createConnectorSpy.mockRestore();
      syncConnectorSpy.mockRestore();
      getSystemKeySpy.mockRestore();
    });

    it("should not create connector when creating a regular space", async () => {
      const createConnectorSpy = vi.spyOn(
        ConnectorsAPI.prototype,
        "createConnector"
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
          getProjectConversationsDatasourceName(space.id)
        );
        expect(dataSource).toBeNull();
      }

      createConnectorSpy.mockRestore();
    });

    it("should handle connector creation failure gracefully", async () => {
      // Mock CoreAPI methods to succeed
      const mockProjectId = Math.floor(Math.random() * 1000000);
      const mockDataSourceId = "test-data-source-id-" + Math.random();

      const createProjectSpy = vi
        .spyOn(CoreAPI.prototype, "createProject")
        .mockResolvedValue(
          new Ok({
            project: {
              project_id: mockProjectId,
            },
          })
        );

      const createDataSourceSpy = vi
        .spyOn(CoreAPI.prototype, "createDataSource")
        .mockResolvedValue(
          new Ok({
            data_source: {
              created: Date.now(),
              data_source_id: mockDataSourceId,
              data_source_internal_id: `internal-${mockDataSourceId}`,
              name: getProjectConversationsDatasourceName(0),
              config: {
                embedder_config: {
                  embedder: {
                    provider_id: "openai",
                    model_id: "text-embedding-ada-002",
                    splitter_id: "base_v0",
                    max_chunk_size: 512,
                  },
                },
                qdrant_config: {
                  cluster: "cluster-0",
                  shadow_write_cluster: null,
                },
              },
            },
          })
        );

      // Mock getOrCreateSystemApiKey to succeed - create a real KeyResource
      const mockSystemKey = await KeyFactory.system(globalGroup);
      const getSystemKeySpy = vi
        .spyOn(await import("@app/lib/auth"), "getOrCreateSystemApiKey")
        .mockResolvedValue(new Ok(mockSystemKey));

      // Mock ConnectorsAPI.createConnector to fail
      const createConnectorError = new Error("Failed to create connector");
      const createConnectorSpy = vi
        .spyOn(ConnectorsAPI.prototype, "createConnector")
        .mockResolvedValue({
          isErr: () => true,
          isOk: () => false,
          error: createConnectorError,
        } as any);

      // Mock delete methods for rollback
      const deleteDataSourceSpy = vi
        .spyOn(DataSourceResource.prototype, "delete")
        .mockResolvedValue(new Ok(undefined));
      const deleteCoreDataSourceSpy = vi
        .spyOn(CoreAPI.prototype, "deleteDataSource")
        .mockResolvedValue(
          new Ok({
            data_source: {
              created: Date.now(),
              data_source_id: mockDataSourceId,
              data_source_internal_id: `internal-${mockDataSourceId}`,
              name: getProjectConversationsDatasourceName(0),
              config: {
                embedder_config: {
                  embedder: {
                    provider_id: "openai",
                    model_id: "text-embedding-ada-002",
                    splitter_id: "base_v0",
                    max_chunk_size: 512,
                  },
                },
                qdrant_config: {
                  cluster: "cluster-0",
                  shadow_write_cluster: null,
                },
              },
            },
          })
        );
      const deleteProjectSpy = vi
        .spyOn(CoreAPI.prototype, "deleteProject")
        .mockResolvedValue(new Ok({ success: true }));

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
        expect(createConnectorSpy).toHaveBeenCalled();

        // Verify rollback was attempted (data source deletion)
        // Note: Rollback happens inside createDustProjectConnectorForSpace
        // The data source should be deleted if connector creation fails
        expect(deleteDataSourceSpy).toHaveBeenCalled();
        expect(deleteCoreDataSourceSpy).toHaveBeenCalled();
        expect(deleteProjectSpy).toHaveBeenCalled();
      }

      // Cleanup
      createProjectSpy.mockRestore();
      createDataSourceSpy.mockRestore();
      getSystemKeySpy.mockRestore();
      createConnectorSpy.mockRestore();
      deleteDataSourceSpy.mockRestore();
      deleteCoreDataSourceSpy.mockRestore();
      deleteProjectSpy.mockRestore();
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
