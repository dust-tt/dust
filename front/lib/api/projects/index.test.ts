import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createDataSourceAndConnectorForProject,
  getProjectConversationsDatasourceName,
} from "@app/lib/api/projects";
import { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { CoreAPIDataSourceConfig, CoreAPIFolder } from "@app/types";
import {
  ConnectorsAPI,
  CoreAPI,
  DEFAULT_EMBEDDING_PROVIDER_ID,
  DEFAULT_QDRANT_CLUSTER,
  dustManagedCredentials,
  EMBEDDING_CONFIGS,
  Err,
  Ok,
} from "@app/types";

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
    getClientFacingUrl: () => "http://localhost:3000",
  },
}));

describe("createDataSourceAndConnectorForProject", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let adminAuth: Authenticator;
  let globalGroup: GroupResource;
  let projectSpace: SpaceResource;

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

    // Create a project space for testing
    projectSpace = await SpaceResource.makeNew(
      {
        name: "Test Project Space",
        kind: "project",
        workspaceId: workspace.id,
      },
      [globalGroup]
    );
  });

  describe("successful creation", () => {
    it("should create dust_project connector with all required components", async () => {
      const mockProjectId = Math.floor(Math.random() * 1000000);
      const mockDataSourceId = "test-data-source-id-" + Math.random();
      const mockConnectorId = "test-connector-id-" + Math.random();
      const mockWorkflowId = "test-workflow-id-" + Math.random();

      // Mock system API key
      const mockSystemKey = await KeyFactory.system(globalGroup);
      const getSystemKeySpy = vi
        .spyOn(await import("@app/lib/auth"), "getOrCreateSystemApiKey")
        .mockResolvedValue(new Ok(mockSystemKey));

      // Mock CoreAPI methods
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
              name: getProjectConversationsDatasourceName(projectSpace),
              config: {
                embedder_config: {
                  embedder: {
                    provider_id: DEFAULT_EMBEDDING_PROVIDER_ID,
                    model_id:
                      EMBEDDING_CONFIGS[DEFAULT_EMBEDDING_PROVIDER_ID].model_id,
                    splitter_id:
                      EMBEDDING_CONFIGS[DEFAULT_EMBEDDING_PROVIDER_ID]
                        .splitter_id,
                    max_chunk_size:
                      EMBEDDING_CONFIGS[DEFAULT_EMBEDDING_PROVIDER_ID]
                        .max_chunk_size,
                  },
                },
                qdrant_config: {
                  cluster: DEFAULT_QDRANT_CLUSTER,
                  shadow_write_cluster: null,
                },
              },
            },
          })
        );

      const upsertFolderSpy = vi
        .spyOn(CoreAPI.prototype, "upsertDataSourceFolder")
        .mockResolvedValue(
          new Ok({
            folder: {
              data_source_id: mockDataSourceId,
              folder_id: "project-context-folder-id",
              timestamp: Date.now(),
              title: "Project Context",
              parent_id: null,
              parents: [],
            } as CoreAPIFolder,
          })
        );

      // Mock ConnectorsAPI methods
      const createConnectorSpy = vi
        .spyOn(ConnectorsAPI.prototype, "createConnector")
        .mockResolvedValue(
          new Ok({
            id: mockConnectorId,
            type: "dust_project",
            workspaceId: workspace.sId,
            dataSourceId: "test-data-source-id",
            connectionId: projectSpace.sId,
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

      const result = await createDataSourceAndConnectorForProject(
        adminAuth,
        projectSpace
      );

      expect(result.isOk()).toBe(true);

      // Verify getOrCreateSystemApiKey was called
      expect(getSystemKeySpy).toHaveBeenCalledTimes(1);
      expect(getSystemKeySpy.mock.calls[0][0].sId).toBe(workspace.sId);

      // Verify CoreAPI.createProject was called
      expect(createProjectSpy).toHaveBeenCalledTimes(1);

      // Verify CoreAPI.createDataSource was called with correct parameters
      expect(createDataSourceSpy).toHaveBeenCalledTimes(1);
      const createDataSourceCall = createDataSourceSpy.mock.calls[0][0];
      expect(createDataSourceCall.projectId).toBe(mockProjectId.toString());
      expect(createDataSourceCall.name).toBe(
        getProjectConversationsDatasourceName(projectSpace)
      );
      expect(
        createDataSourceCall.config.embedder_config.embedder.provider_id
      ).toBe(DEFAULT_EMBEDDING_PROVIDER_ID);
      expect(createDataSourceCall.config.qdrant_config?.cluster).toBe(
        DEFAULT_QDRANT_CLUSTER
      );
      expect(createDataSourceCall.credentials).toEqual(
        dustManagedCredentials()
      );

      // Verify project context folder was created
      expect(upsertFolderSpy).toHaveBeenCalledTimes(1);
      const folderCall = upsertFolderSpy.mock.calls[0][0];
      expect(folderCall.projectId).toBe(mockProjectId.toString());
      expect(folderCall.dataSourceId).toBe(mockDataSourceId);

      // Verify ConnectorsAPI.createConnector was called with correct parameters
      expect(createConnectorSpy).toHaveBeenCalledTimes(1);
      const createConnectorCall = createConnectorSpy.mock.calls[0][0];
      expect(createConnectorCall.provider).toBe("dust_project");
      expect(createConnectorCall.workspaceId).toBe(workspace.sId);
      expect(createConnectorCall.workspaceAPIKey).toBe(mockSystemKey.secret);
      expect(createConnectorCall.dataSourceId).toBeDefined();
      expect(createConnectorCall.connectionId).toBe(projectSpace.sId);
      expect(createConnectorCall.configuration).toBeNull();

      // Verify ConnectorsAPI.syncConnector was called to trigger initial sync
      expect(syncConnectorSpy).toHaveBeenCalledTimes(1);
      expect(syncConnectorSpy).toHaveBeenCalledWith(mockConnectorId);

      // Verify data source was created and linked to connector
      const dataSource = await DataSourceResource.fetchByNameOrId(
        adminAuth,
        getProjectConversationsDatasourceName(projectSpace)
      );
      expect(dataSource).toBeDefined();
      expect(dataSource?.connectorProvider).toBe("dust_project");
      expect(dataSource?.connectorId?.toString()).toBe(mockConnectorId);
      expect(dataSource?.name).toBe(
        getProjectConversationsDatasourceName(projectSpace)
      );

      // Cleanup spies
      getSystemKeySpy.mockRestore();
      createProjectSpy.mockRestore();
      createDataSourceSpy.mockRestore();
      upsertFolderSpy.mockRestore();
      createConnectorSpy.mockRestore();
      syncConnectorSpy.mockRestore();
    });

    it("should return early if connector already exists", async () => {
      // First, create a connector
      const mockProjectId = Math.floor(Math.random() * 1000000);
      const mockDataSourceId = "test-data-source-id-" + Math.random();
      const mockConnectorId = "test-connector-id-" + Math.random();

      const mockSystemKey = await KeyFactory.system(globalGroup);
      const getSystemKeySpy = vi
        .spyOn(await import("@app/lib/auth"), "getOrCreateSystemApiKey")
        .mockResolvedValue(new Ok(mockSystemKey));

      const createProjectSpy1 = vi
        .spyOn(CoreAPI.prototype, "createProject")
        .mockResolvedValue(
          new Ok({
            project: {
              project_id: mockProjectId,
            },
          })
        );

      const createDataSourceSpy1 = vi
        .spyOn(CoreAPI.prototype, "createDataSource")
        .mockResolvedValue(
          new Ok({
            data_source: {
              created: Date.now(),
              data_source_id: mockDataSourceId,
              data_source_internal_id: `internal-${mockDataSourceId}`,
              name: getProjectConversationsDatasourceName(projectSpace),
              config: {
                embedder_config: {
                  embedder: {
                    provider_id: DEFAULT_EMBEDDING_PROVIDER_ID,
                    model_id:
                      EMBEDDING_CONFIGS[DEFAULT_EMBEDDING_PROVIDER_ID].model_id,
                    splitter_id:
                      EMBEDDING_CONFIGS[DEFAULT_EMBEDDING_PROVIDER_ID]
                        .splitter_id,
                    max_chunk_size:
                      EMBEDDING_CONFIGS[DEFAULT_EMBEDDING_PROVIDER_ID]
                        .max_chunk_size,
                  },
                },
                qdrant_config: {
                  cluster: DEFAULT_QDRANT_CLUSTER,
                  shadow_write_cluster: null,
                },
              },
            },
          })
        );

      const upsertFolderSpy1 = vi
        .spyOn(CoreAPI.prototype, "upsertDataSourceFolder")
        .mockResolvedValue(
          new Ok({
            folder: {
              data_source_id: mockDataSourceId,
              folder_id: "project-context-folder-id",
              timestamp: Date.now(),
              title: "Project Context",
              parent_id: null,
              parents: [],
            } as CoreAPIFolder,
          })
        );

      const createConnectorSpy1 = vi
        .spyOn(ConnectorsAPI.prototype, "createConnector")
        .mockResolvedValue(
          new Ok({
            id: mockConnectorId,
            type: "dust_project",
            workspaceId: workspace.sId,
            dataSourceId: "test-data-source-id",
            connectionId: projectSpace.sId,
            useProxy: false,
            configuration: null,
            updatedAt: Date.now(),
          })
        );

      const syncConnectorSpy1 = vi
        .spyOn(ConnectorsAPI.prototype, "syncConnector")
        .mockResolvedValue(
          new Ok({
            workflowId: "test-workflow-id",
          })
        );

      // Create connector first time
      const firstResult = await createDataSourceAndConnectorForProject(
        adminAuth,
        projectSpace
      );
      expect(firstResult.isOk()).toBe(true);

      // Verify data source was created and can be found
      const dataSource = await DataSourceResource.fetchByNameOrId(
        adminAuth,
        getProjectConversationsDatasourceName(projectSpace)
      );
      expect(dataSource).toBeDefined();
      expect(dataSource?.connectorProvider).toBe("dust_project");

      // Restore first set of spies
      getSystemKeySpy.mockRestore();
      createProjectSpy1.mockRestore();
      createDataSourceSpy1.mockRestore();
      upsertFolderSpy1.mockRestore();
      createConnectorSpy1.mockRestore();
      syncConnectorSpy1.mockRestore();

      // Create new spies to track second call
      const createProjectSpy2 = vi.spyOn(CoreAPI.prototype, "createProject");
      const createConnectorSpy2 = vi.spyOn(
        ConnectorsAPI.prototype,
        "createConnector"
      );

      // Call again - should return early without creating anything
      const secondResult = await createDataSourceAndConnectorForProject(
        adminAuth,
        projectSpace
      );
      expect(secondResult.isOk()).toBe(true);

      // Verify no additional calls were made
      expect(createProjectSpy2).not.toHaveBeenCalled();
      expect(createConnectorSpy2).not.toHaveBeenCalled();

      // Cleanup
      createProjectSpy2.mockRestore();
      createConnectorSpy2.mockRestore();
    });
  });

  describe("error handling", () => {
    it("should return error when system API key creation fails", async () => {
      const getSystemKeySpy = vi
        .spyOn(await import("@app/lib/auth"), "getOrCreateSystemApiKey")
        .mockResolvedValue(
          new Err(new Error("Failed to create system API key"))
        );

      const result = await createDataSourceAndConnectorForProject(
        adminAuth,
        projectSpace
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain(
          "Could not create the system API key"
        );
      }

      // Verify no Core API calls were made
      const createProjectSpy = vi.spyOn(CoreAPI.prototype, "createProject");
      expect(createProjectSpy).not.toHaveBeenCalled();

      getSystemKeySpy.mockRestore();
      createProjectSpy.mockRestore();
    });

    it("should return error and clean up when Core API project creation fails", async () => {
      const mockSystemKey = await KeyFactory.system(globalGroup);
      vi.spyOn(
        await import("@app/lib/auth"),
        "getOrCreateSystemApiKey"
      ).mockResolvedValue(new Ok(mockSystemKey));

      const createProjectError = {
        message: "Failed to create project",
        code: "internal_server_error",
      };
      const createProjectSpy = vi
        .spyOn(CoreAPI.prototype, "createProject")
        .mockResolvedValue(new Err(createProjectError));

      const result = await createDataSourceAndConnectorForProject(
        adminAuth,
        projectSpace
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain(
          "Failed to create internal project for the data source"
        );
      }

      expect(createProjectSpy).toHaveBeenCalledTimes(1);

      createProjectSpy.mockRestore();
    });

    it("should rollback project when data source creation fails", async () => {
      const mockProjectId = Math.floor(Math.random() * 1000000);
      const mockSystemKey = await KeyFactory.system(globalGroup);

      vi.spyOn(
        await import("@app/lib/auth"),
        "getOrCreateSystemApiKey"
      ).mockResolvedValue(new Ok(mockSystemKey));

      const createProjectSpy = vi
        .spyOn(CoreAPI.prototype, "createProject")
        .mockResolvedValue(
          new Ok({
            project: {
              project_id: mockProjectId,
            },
          })
        );

      const createDataSourceError = {
        message: "Failed to create data source",
        code: "internal_server_error",
      };
      const createDataSourceSpy = vi
        .spyOn(CoreAPI.prototype, "createDataSource")
        .mockResolvedValue(new Err(createDataSourceError));

      const deleteProjectSpy = vi
        .spyOn(CoreAPI.prototype, "deleteProject")
        .mockResolvedValue(new Ok({ success: true }));

      const result = await createDataSourceAndConnectorForProject(
        adminAuth,
        projectSpace
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain(
          "Failed to create the data source"
        );
      }

      // Verify rollback: project was deleted
      expect(deleteProjectSpy).toHaveBeenCalledTimes(1);
      expect(deleteProjectSpy).toHaveBeenCalledWith({
        projectId: mockProjectId.toString(),
      });

      createProjectSpy.mockRestore();
      createDataSourceSpy.mockRestore();
      deleteProjectSpy.mockRestore();
    });

    it("should rollback project when folder creation fails", async () => {
      const mockProjectId = Math.floor(Math.random() * 1000000);
      const mockDataSourceId = "test-data-source-id-" + Math.random();
      const mockSystemKey = await KeyFactory.system(globalGroup);

      vi.spyOn(
        await import("@app/lib/auth"),
        "getOrCreateSystemApiKey"
      ).mockResolvedValue(new Ok(mockSystemKey));

      vi.spyOn(CoreAPI.prototype, "createProject").mockResolvedValue(
        new Ok({
          project: {
            project_id: mockProjectId,
          },
        })
      );

      vi.spyOn(CoreAPI.prototype, "createDataSource").mockResolvedValue(
        new Ok({
          data_source: {
            created: Date.now(),
            data_source_id: mockDataSourceId,
            data_source_internal_id: `internal-${mockDataSourceId}`,
            name: getProjectConversationsDatasourceName(projectSpace),
            config: {
              embedder_config: {
                embedder: {
                  provider_id: DEFAULT_EMBEDDING_PROVIDER_ID,
                  model_id:
                    EMBEDDING_CONFIGS[DEFAULT_EMBEDDING_PROVIDER_ID].model_id,
                  splitter_id:
                    EMBEDDING_CONFIGS[DEFAULT_EMBEDDING_PROVIDER_ID]
                      .splitter_id,
                  max_chunk_size:
                    EMBEDDING_CONFIGS[DEFAULT_EMBEDDING_PROVIDER_ID]
                      .max_chunk_size,
                },
              },
              qdrant_config: {
                cluster: DEFAULT_QDRANT_CLUSTER,
                shadow_write_cluster: null,
              },
            },
          },
        })
      );

      const folderError = {
        message: "Failed to create folder",
        code: "internal_server_error",
      };
      const upsertFolderSpy = vi
        .spyOn(CoreAPI.prototype, "upsertDataSourceFolder")
        .mockResolvedValue(new Err(folderError));

      const deleteProjectSpy = vi
        .spyOn(CoreAPI.prototype, "deleteProject")
        .mockResolvedValue(new Ok({ success: true }));

      const result = await createDataSourceAndConnectorForProject(
        adminAuth,
        projectSpace
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain(
          "Failed to create project context folder"
        );
      }

      // Verify rollback: project was deleted
      expect(deleteProjectSpy).toHaveBeenCalledTimes(1);
      expect(deleteProjectSpy).toHaveBeenCalledWith({
        projectId: mockProjectId.toString(),
      });

      upsertFolderSpy.mockRestore();
      deleteProjectSpy.mockRestore();
    });

    it("should rollback all resources when connector creation fails", async () => {
      const mockProjectId = Math.floor(Math.random() * 1000000);
      const mockDataSourceId = "test-data-source-id-" + Math.random();
      const mockSystemKey = await KeyFactory.system(globalGroup);

      vi.spyOn(
        await import("@app/lib/auth"),
        "getOrCreateSystemApiKey"
      ).mockResolvedValue(new Ok(mockSystemKey));

      vi.spyOn(CoreAPI.prototype, "createProject").mockResolvedValue(
        new Ok({
          project: {
            project_id: mockProjectId,
          },
        })
      );

      vi.spyOn(CoreAPI.prototype, "createDataSource").mockResolvedValue(
        new Ok({
          data_source: {
            created: Date.now(),
            data_source_id: mockDataSourceId,
            data_source_internal_id: `internal-${mockDataSourceId}`,
            name: getProjectConversationsDatasourceName(projectSpace),
            config: {
              embedder_config: {
                embedder: {
                  provider_id: DEFAULT_EMBEDDING_PROVIDER_ID,
                  model_id:
                    EMBEDDING_CONFIGS[DEFAULT_EMBEDDING_PROVIDER_ID].model_id,
                  splitter_id:
                    EMBEDDING_CONFIGS[DEFAULT_EMBEDDING_PROVIDER_ID]
                      .splitter_id,
                  max_chunk_size:
                    EMBEDDING_CONFIGS[DEFAULT_EMBEDDING_PROVIDER_ID]
                      .max_chunk_size,
                },
              },
              qdrant_config: {
                cluster: DEFAULT_QDRANT_CLUSTER,
                shadow_write_cluster: null,
              },
            },
          },
        })
      );

      vi.spyOn(CoreAPI.prototype, "upsertDataSourceFolder").mockResolvedValue(
        new Ok({
          folder: {
            data_source_id: mockDataSourceId,
            folder_id: "project-context-folder-id",
            timestamp: Date.now(),
            title: "Project Context",
            parent_id: null,
            parents: [],
          } as CoreAPIFolder,
        })
      );

      const connectorError = {
        type: "internal_server_error" as const,
        message: "Failed to create connector",
      };
      const createConnectorSpy = vi
        .spyOn(ConnectorsAPI.prototype, "createConnector")
        .mockResolvedValue(new Err(connectorError));

      // Mock DataSourceResource.delete for rollback
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
              name: getProjectConversationsDatasourceName(projectSpace),
              config: {
                embedder_config: {
                  embedder: {
                    provider_id: DEFAULT_EMBEDDING_PROVIDER_ID,
                    model_id:
                      EMBEDDING_CONFIGS[DEFAULT_EMBEDDING_PROVIDER_ID].model_id,
                    splitter_id:
                      EMBEDDING_CONFIGS[DEFAULT_EMBEDDING_PROVIDER_ID]
                        .splitter_id,
                    max_chunk_size:
                      EMBEDDING_CONFIGS[DEFAULT_EMBEDDING_PROVIDER_ID]
                        .max_chunk_size,
                  },
                },
                qdrant_config: {
                  cluster: DEFAULT_QDRANT_CLUSTER,
                  shadow_write_cluster: null,
                },
              } as CoreAPIDataSourceConfig,
            },
          })
        );

      const deleteProjectSpy = vi
        .spyOn(CoreAPI.prototype, "deleteProject")
        .mockResolvedValue(new Ok({ success: true }));

      const result = await createDataSourceAndConnectorForProject(
        adminAuth,
        projectSpace
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain(
          "Failed to create the connector"
        );
      }

      // Verify rollback: all resources were cleaned up
      expect(deleteDataSourceSpy).toHaveBeenCalledTimes(1);
      expect(deleteCoreDataSourceSpy).toHaveBeenCalledTimes(1);
      expect(deleteCoreDataSourceSpy).toHaveBeenCalledWith({
        projectId: mockProjectId.toString(),
        dataSourceId: mockDataSourceId,
      });
      expect(deleteProjectSpy).toHaveBeenCalledTimes(1);
      expect(deleteProjectSpy).toHaveBeenCalledWith({
        projectId: mockProjectId.toString(),
      });

      createConnectorSpy.mockRestore();
      deleteDataSourceSpy.mockRestore();
      deleteCoreDataSourceSpy.mockRestore();
      deleteProjectSpy.mockRestore();
    });

    it("should succeed even if sync trigger fails", async () => {
      const mockProjectId = Math.floor(Math.random() * 1000000);
      const mockDataSourceId = "test-data-source-id-" + Math.random();
      const mockConnectorId = "test-connector-id-" + Math.random();
      const mockSystemKey = await KeyFactory.system(globalGroup);

      vi.spyOn(
        await import("@app/lib/auth"),
        "getOrCreateSystemApiKey"
      ).mockResolvedValue(new Ok(mockSystemKey));

      vi.spyOn(CoreAPI.prototype, "createProject").mockResolvedValue(
        new Ok({
          project: {
            project_id: mockProjectId,
          },
        })
      );

      vi.spyOn(CoreAPI.prototype, "createDataSource").mockResolvedValue(
        new Ok({
          data_source: {
            created: Date.now(),
            data_source_id: mockDataSourceId,
            data_source_internal_id: `internal-${mockDataSourceId}`,
            name: getProjectConversationsDatasourceName(projectSpace),
            config: {
              embedder_config: {
                embedder: {
                  provider_id: DEFAULT_EMBEDDING_PROVIDER_ID,
                  model_id:
                    EMBEDDING_CONFIGS[DEFAULT_EMBEDDING_PROVIDER_ID].model_id,
                  splitter_id:
                    EMBEDDING_CONFIGS[DEFAULT_EMBEDDING_PROVIDER_ID]
                      .splitter_id,
                  max_chunk_size:
                    EMBEDDING_CONFIGS[DEFAULT_EMBEDDING_PROVIDER_ID]
                      .max_chunk_size,
                },
              },
              qdrant_config: {
                cluster: DEFAULT_QDRANT_CLUSTER,
                shadow_write_cluster: null,
              },
            },
          },
        })
      );

      vi.spyOn(CoreAPI.prototype, "upsertDataSourceFolder").mockResolvedValue(
        new Ok({
          folder: {
            data_source_id: mockDataSourceId,
            folder_id: "project-context-folder-id",
            timestamp: Date.now(),
            title: "Project Context",
            parent_id: null,
            parents: [],
          } as CoreAPIFolder,
        })
      );

      vi.spyOn(ConnectorsAPI.prototype, "createConnector").mockResolvedValue(
        new Ok({
          id: mockConnectorId,
          type: "dust_project",
          workspaceId: workspace.sId,
          dataSourceId: "test-data-source-id",
          connectionId: projectSpace.sId,
          useProxy: false,
          configuration: null,
          updatedAt: Date.now(),
        })
      );

      const syncError = {
        type: "internal_server_error" as const,
        message: "Failed to trigger sync",
      };
      const syncConnectorSpy = vi
        .spyOn(ConnectorsAPI.prototype, "syncConnector")
        .mockResolvedValue(new Err(syncError));

      const result = await createDataSourceAndConnectorForProject(
        adminAuth,
        projectSpace
      );

      // Should succeed even if sync fails
      expect(result.isOk()).toBe(true);

      // Verify sync was attempted
      expect(syncConnectorSpy).toHaveBeenCalledTimes(1);
      expect(syncConnectorSpy).toHaveBeenCalledWith(mockConnectorId);

      // Verify connector was still created and linked
      const dataSource = await DataSourceResource.fetchByNameOrId(
        adminAuth,
        getProjectConversationsDatasourceName(projectSpace)
      );
      expect(dataSource).toBeDefined();
      expect(dataSource?.connectorId?.toString()).toBe(mockConnectorId);

      syncConnectorSpy.mockRestore();
    });
  });
});
