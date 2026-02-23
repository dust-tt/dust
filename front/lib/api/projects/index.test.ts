import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock distributed lock to avoid Redis dependency
vi.mock("@app/lib/lock", () => ({
  executeWithLock: vi.fn(async (_lockName, fn) => {
    // Simply execute the function without locking in tests
    return fn();
  }),
}));

import {
  createDataSourceAndConnectorForProject,
  getProjectConversationsDatasourceName,
} from "@app/lib/api/projects";
import { Authenticator } from "@app/lib/auth";
import { isConnectorProviderAssistantDefaultSelected } from "@app/lib/connector_providers";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { dustManagedCredentials } from "@app/types/api/credentials";
import { DEFAULT_EMBEDDING_PROVIDER_ID } from "@app/types/assistant/models/embedding";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { CoreAPI, EMBEDDING_CONFIGS } from "@app/types/core/core_api";
import type {
  CoreAPIDataSourceConfig,
  CoreAPIFolder,
} from "@app/types/core/data_source";
import { DEFAULT_QDRANT_CLUSTER } from "@app/types/core/data_source";
import { Err, Ok } from "@app/types/shared/result";

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
    getAppUrl: () => "http://localhost:3000",
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
      { members: [globalGroup] }
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

      // Verify only one dust_project datasource exists
      const finalDataSources = await DataSourceResource.listBySpace(
        adminAuth,
        projectSpace,
        undefined,
        "dust_project"
      );
      expect(finalDataSources.length).toBe(1);

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

      // Mock verification calls for second call (idempotency check)
      const getSystemKeySpy2 = vi
        .spyOn(await import("@app/lib/auth"), "getOrCreateSystemApiKey")
        .mockResolvedValue(new Ok(mockSystemKey));

      const getDataSourceSpy = vi
        .spyOn(CoreAPI.prototype, "getDataSource")
        .mockResolvedValue(
          new Ok({
            data_source: {
              data_source_id: mockDataSourceId,
              data_source_internal_id: `internal-${mockDataSourceId}`,
              name: getProjectConversationsDatasourceName(projectSpace),
              project_id: mockProjectId.toString(),
              created: 1234567890,
              updated: 1234567890,
              config: {
                embedder_config: {
                  embedder: {
                    max_chunk_size: 512,
                    model_id: "text-embedding-ada-002",
                    provider_id: "openai",
                    splitter_id: "base_v0",
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

      const upsertFolderSpy2 = vi
        .spyOn(CoreAPI.prototype, "upsertDataSourceFolder")
        .mockResolvedValue(
          new Ok({
            folder: {
              data_source_id: mockDataSourceId,
              folder_id: "context",
              parent_id: null,
              parents: ["context"],
              title: "Context",
              timestamp: 1234567890,
            },
          })
        );

      const getConnectorSpy = vi
        .spyOn(ConnectorsAPI.prototype, "getConnector")
        .mockResolvedValue(
          new Ok({
            id: mockConnectorId,
            type: "dust_project",
            workspaceId: workspace.sId,
            dataSourceId: dataSource?.sId ?? "",
            connectionId: projectSpace.sId,
            useProxy: false,
            configuration: null,
            updatedAt: 1234567890,
          })
        );

      // Create new spies to track second call - these should NOT be called
      const createProjectSpy2 = vi.spyOn(CoreAPI.prototype, "createProject");
      const createDataSourceSpy2 = vi.spyOn(
        CoreAPI.prototype,
        "createDataSource"
      );
      const createConnectorSpy2 = vi.spyOn(
        ConnectorsAPI.prototype,
        "createConnector"
      );

      // Call again - should verify everything exists and return early without creating anything
      const secondResult = await createDataSourceAndConnectorForProject(
        adminAuth,
        projectSpace
      );
      expect(secondResult.isOk()).toBe(true);

      // Verify verification calls were made
      expect(getSystemKeySpy2).toHaveBeenCalled();
      expect(getDataSourceSpy).toHaveBeenCalled();
      expect(upsertFolderSpy2).toHaveBeenCalled();
      expect(getConnectorSpy).toHaveBeenCalled();

      // Verify no creation calls were made
      expect(createProjectSpy2).not.toHaveBeenCalled();
      expect(createDataSourceSpy2).not.toHaveBeenCalled();
      expect(createConnectorSpy2).not.toHaveBeenCalled();

      // Cleanup
      getSystemKeySpy2.mockRestore();
      getDataSourceSpy.mockRestore();
      upsertFolderSpy2.mockRestore();
      getConnectorSpy.mockRestore();
      createProjectSpy2.mockRestore();
      createDataSourceSpy2.mockRestore();
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

      // Verify only one dust_project datasource exists
      const finalDataSources = await DataSourceResource.listBySpace(
        adminAuth,
        projectSpace,
        undefined,
        "dust_project"
      );
      expect(finalDataSources.length).toBe(1);

      syncConnectorSpy.mockRestore();
    });

    it("should delete orphaned front data source when Core API data source is missing", async () => {
      const mockProjectId = Math.floor(Math.random() * 1000000);
      const mockDataSourceId = "test-data-source-id-" + Math.random();
      const mockConnectorId = "test-connector-id-" + Math.random();
      const mockOrphanedProjectId = "orphaned-project-id";
      const mockOrphanedDataSourceId = "orphaned-data-source-id";
      const mockSystemKey = await KeyFactory.system(globalGroup);

      // Create an orphaned front DataSourceResource (exists but Core API data source doesn't)
      await DataSourceViewResource.createDataSourceAndDefaultView(
        {
          assistantDefaultSelected:
            isConnectorProviderAssistantDefaultSelected("dust_project"),
          connectorProvider: "dust_project",
          description: `Conversations from project ${projectSpace.sId}`,
          dustAPIProjectId: mockOrphanedProjectId,
          dustAPIDataSourceId: mockOrphanedDataSourceId,
          name: getProjectConversationsDatasourceName(projectSpace),
          workspaceId: workspace.id,
        },
        projectSpace,
        adminAuth.user()
      );

      vi.spyOn(
        await import("@app/lib/auth"),
        "getOrCreateSystemApiKey"
      ).mockResolvedValue(new Ok(mockSystemKey));

      // Mock CoreAPI.getDataSource to return error (Core API data source doesn't exist)
      const getDataSourceSpy = vi
        .spyOn(CoreAPI.prototype, "getDataSource")
        .mockResolvedValue(
          new Err({
            type: "data_source_not_found",
            message: "Data source not found",
            code: "data_source_not_found",
          })
        );

      // Mock delete to verify it's called
      // We need to spy on the instance that will be fetched, not the one we just created
      // So we'll check after the fact that the orphaned one was deleted

      // Mock creation of new Core API components
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

      vi.spyOn(ConnectorsAPI.prototype, "syncConnector").mockResolvedValue(
        new Ok({
          workflowId: "test-workflow-id",
        })
      );

      const result = await createDataSourceAndConnectorForProject(
        adminAuth,
        projectSpace
      );

      expect(result.isOk()).toBe(true);

      // Verify Core API getDataSource was called to check the orphaned data source
      expect(getDataSourceSpy).toHaveBeenCalledWith({
        projectId: mockOrphanedProjectId,
        dataSourceId: mockOrphanedDataSourceId,
      });

      // Verify only one data source exists now (the new one, orphaned one was deleted)
      const dataSources = await DataSourceResource.listBySpace(
        adminAuth,
        projectSpace,
        undefined,
        "dust_project"
      );
      expect(dataSources.length).toBe(1);
      expect(dataSources[0].dustAPIProjectId).toBe(mockProjectId.toString());
      expect(dataSources[0].dustAPIDataSourceId).toBe(mockDataSourceId);

      // Verify the orphaned data source no longer exists
      const orphanedCheck = await DataSourceResource.fetchByNameOrId(
        adminAuth,
        getProjectConversationsDatasourceName(projectSpace)
      );
      // Should find the new one, not the orphaned one
      expect(orphanedCheck).toBeDefined();
      expect(orphanedCheck?.dustAPIProjectId).toBe(mockProjectId.toString());
      expect(orphanedCheck?.dustAPIDataSourceId).toBe(mockDataSourceId);

      // Verify only one dust_project datasource exists
      const finalDataSources = await DataSourceResource.listBySpace(
        adminAuth,
        projectSpace,
        undefined,
        "dust_project"
      );
      expect(finalDataSources.length).toBe(1);
    });

    it("should create connector when front data source exists but connectorId is null", async () => {
      const mockProjectId = Math.floor(Math.random() * 1000000);
      const mockDataSourceId = "test-data-source-id-" + Math.random();
      const mockConnectorId = "test-connector-id-" + Math.random();
      const mockSystemKey = await KeyFactory.system(globalGroup);

      // Create front DataSourceResource without connectorId
      const dataSourceView =
        await DataSourceViewResource.createDataSourceAndDefaultView(
          {
            assistantDefaultSelected:
              isConnectorProviderAssistantDefaultSelected("dust_project"),
            connectorProvider: "dust_project",
            description: `Conversations from project ${projectSpace.sId}`,
            dustAPIProjectId: mockProjectId.toString(),
            dustAPIDataSourceId: mockDataSourceId,
            name: getProjectConversationsDatasourceName(projectSpace),
            workspaceId: workspace.id,
          },
          projectSpace,
          adminAuth.user()
        );
      const dataSource = dataSourceView.dataSource;
      // Ensure connectorId is null
      expect(dataSource.connectorId).toBeNull();

      vi.spyOn(
        await import("@app/lib/auth"),
        "getOrCreateSystemApiKey"
      ).mockResolvedValue(new Ok(mockSystemKey));

      // Mock CoreAPI.getDataSource to return success (Core API data source exists)
      vi.spyOn(CoreAPI.prototype, "getDataSource").mockResolvedValue(
        new Ok({
          data_source: {
            data_source_id: mockDataSourceId,
            data_source_internal_id: `internal-${mockDataSourceId}`,
            name: getProjectConversationsDatasourceName(projectSpace),
            project_id: mockProjectId.toString(),
            created: 1234567890,
            updated: 1234567890,
            config: {
              embedder_config: {
                embedder: {
                  max_chunk_size: 512,
                  model_id: "text-embedding-ada-002",
                  provider_id: "openai",
                  splitter_id: "base_v0",
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
            folder_id: "context",
            parent_id: null,
            parents: ["context"],
            title: "Context",
            timestamp: 1234567890,
          },
        })
      );

      const createConnectorSpy = vi
        .spyOn(ConnectorsAPI.prototype, "createConnector")
        .mockResolvedValue(
          new Ok({
            id: mockConnectorId,
            type: "dust_project",
            workspaceId: workspace.sId,
            dataSourceId: dataSource.sId,
            connectionId: projectSpace.sId,
            useProxy: false,
            configuration: null,
            updatedAt: Date.now(),
          })
        );

      vi.spyOn(ConnectorsAPI.prototype, "syncConnector").mockResolvedValue(
        new Ok({
          workflowId: "test-workflow-id",
        })
      );

      const result = await createDataSourceAndConnectorForProject(
        adminAuth,
        projectSpace
      );

      expect(result.isOk()).toBe(true);

      // Verify connector was created
      expect(createConnectorSpy).toHaveBeenCalledTimes(1);
      expect(createConnectorSpy).toHaveBeenCalledWith({
        provider: "dust_project",
        workspaceId: workspace.sId,
        workspaceAPIKey: mockSystemKey.secret,
        dataSourceId: dataSource.sId,
        connectionId: projectSpace.sId,
        configuration: null,
      });

      // Verify connectorId was set
      const updatedDataSource = await DataSourceResource.fetchByNameOrId(
        adminAuth,
        getProjectConversationsDatasourceName(projectSpace)
      );
      expect(updatedDataSource).toBeDefined();
      expect(updatedDataSource?.connectorId?.toString()).toBe(mockConnectorId);

      // Verify only one dust_project datasource exists
      const finalDataSources = await DataSourceResource.listBySpace(
        adminAuth,
        projectSpace,
        undefined,
        "dust_project"
      );
      expect(finalDataSources.length).toBe(1);

      createConnectorSpy.mockRestore();
    });

    it("should recreate connector when connectorId exists but connector not found in ConnectorsAPI", async () => {
      const mockProjectId = Math.floor(Math.random() * 1000000);
      const mockDataSourceId = "test-data-source-id-" + Math.random();
      const mockOrphanedConnectorId = "orphaned-connector-id";
      const mockNewConnectorId = "new-connector-id";
      const mockSystemKey = await KeyFactory.system(globalGroup);

      // Create front DataSourceResource with orphaned connectorId
      const dataSourceView =
        await DataSourceViewResource.createDataSourceAndDefaultView(
          {
            assistantDefaultSelected:
              isConnectorProviderAssistantDefaultSelected("dust_project"),
            connectorProvider: "dust_project",
            description: `Conversations from project ${projectSpace.sId}`,
            dustAPIProjectId: mockProjectId.toString(),
            dustAPIDataSourceId: mockDataSourceId,
            name: getProjectConversationsDatasourceName(projectSpace),
            workspaceId: workspace.id,
          },
          projectSpace,
          adminAuth.user()
        );
      const dataSource = dataSourceView.dataSource;
      // Set an orphaned connectorId
      await dataSource.setConnectorId(mockOrphanedConnectorId);

      vi.spyOn(
        await import("@app/lib/auth"),
        "getOrCreateSystemApiKey"
      ).mockResolvedValue(new Ok(mockSystemKey));

      // Mock CoreAPI.getDataSource to return success
      vi.spyOn(CoreAPI.prototype, "getDataSource").mockResolvedValue(
        new Ok({
          data_source: {
            data_source_id: mockDataSourceId,
            data_source_internal_id: `internal-${mockDataSourceId}`,
            name: getProjectConversationsDatasourceName(projectSpace),
            project_id: mockProjectId.toString(),
            created: 1234567890,
            updated: 1234567890,
            config: {
              embedder_config: {
                embedder: {
                  max_chunk_size: 512,
                  model_id: "text-embedding-ada-002",
                  provider_id: "openai",
                  splitter_id: "base_v0",
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
            folder_id: "context",
            parent_id: null,
            parents: ["context"],
            title: "Context",
            timestamp: 1234567890,
          },
        })
      );

      // Mock getConnector to return error (connector doesn't exist)
      const getConnectorSpy = vi
        .spyOn(ConnectorsAPI.prototype, "getConnector")
        .mockResolvedValue(
          new Err({
            type: "connector_not_found",
            message: "Connector not found",
          })
        );

      const createConnectorSpy = vi
        .spyOn(ConnectorsAPI.prototype, "createConnector")
        .mockResolvedValue(
          new Ok({
            id: mockNewConnectorId,
            type: "dust_project",
            workspaceId: workspace.sId,
            dataSourceId: dataSource.sId,
            connectionId: projectSpace.sId,
            useProxy: false,
            configuration: null,
            updatedAt: Date.now(),
          })
        );

      vi.spyOn(ConnectorsAPI.prototype, "syncConnector").mockResolvedValue(
        new Ok({
          workflowId: "test-workflow-id",
        })
      );

      const result = await createDataSourceAndConnectorForProject(
        adminAuth,
        projectSpace
      );

      expect(result.isOk()).toBe(true);

      // Verify getConnector was called to check the orphaned connector
      expect(getConnectorSpy).toHaveBeenCalledWith(mockOrphanedConnectorId);

      // Verify new connector was created
      expect(createConnectorSpy).toHaveBeenCalledTimes(1);

      // Verify connectorId was updated
      const updatedDataSource = await DataSourceResource.fetchByNameOrId(
        adminAuth,
        getProjectConversationsDatasourceName(projectSpace)
      );
      expect(updatedDataSource).toBeDefined();
      expect(updatedDataSource?.connectorId?.toString()).toBe(
        mockNewConnectorId
      );

      // Verify only one dust_project datasource exists
      const finalDataSources = await DataSourceResource.listBySpace(
        adminAuth,
        projectSpace,
        undefined,
        "dust_project"
      );
      expect(finalDataSources.length).toBe(1);

      getConnectorSpy.mockRestore();
      createConnectorSpy.mockRestore();
    });

    it("should create everything from scratch when front DataSourceResource is missing", async () => {
      const mockProjectId = Math.floor(Math.random() * 1000000);
      const mockDataSourceId = "test-data-source-id-" + Math.random();
      const mockConnectorId = "test-connector-id-" + Math.random();
      const mockSystemKey = await KeyFactory.system(globalGroup);

      vi.spyOn(
        await import("@app/lib/auth"),
        "getOrCreateSystemApiKey"
      ).mockResolvedValue(new Ok(mockSystemKey));

      // Verify no front DataSourceResource exists initially
      const initialDataSources = await DataSourceResource.listBySpace(
        adminAuth,
        projectSpace,
        undefined,
        "dust_project"
      );
      expect(initialDataSources.length).toBe(0);

      // Mock creation of Core API components
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

      const createConnectorSpy = vi
        .spyOn(ConnectorsAPI.prototype, "createConnector")
        .mockResolvedValue(
          new Ok({
            id: mockConnectorId,
            type: "dust_project",
            workspaceId: workspace.sId,
            dataSourceId: "will-be-set",
            connectionId: projectSpace.sId,
            useProxy: false,
            configuration: null,
            updatedAt: Date.now(),
          })
        );

      vi.spyOn(ConnectorsAPI.prototype, "syncConnector").mockResolvedValue(
        new Ok({
          workflowId: "test-workflow-id",
        })
      );

      const result = await createDataSourceAndConnectorForProject(
        adminAuth,
        projectSpace
      );

      expect(result.isOk()).toBe(true);

      // Verify Core API components were created
      expect(createProjectSpy).toHaveBeenCalledTimes(1);
      expect(createDataSourceSpy).toHaveBeenCalledTimes(1);

      // Verify front DataSourceResource was created
      const dataSources = await DataSourceResource.listBySpace(
        adminAuth,
        projectSpace,
        undefined,
        "dust_project"
      );
      expect(dataSources.length).toBe(1);
      expect(dataSources[0].dustAPIProjectId).toBe(mockProjectId.toString());
      expect(dataSources[0].dustAPIDataSourceId).toBe(mockDataSourceId);
      expect(dataSources[0].connectorId?.toString()).toBe(mockConnectorId);

      // Verify only one dust_project datasource exists (redundant but explicit)
      const finalDataSources = await DataSourceResource.listBySpace(
        adminAuth,
        projectSpace,
        undefined,
        "dust_project"
      );
      expect(finalDataSources.length).toBe(1);

      createProjectSpy.mockRestore();
      createDataSourceSpy.mockRestore();
      createConnectorSpy.mockRestore();
    });

    it("should create folder when it's missing", async () => {
      const mockProjectId = Math.floor(Math.random() * 1000000);
      const mockDataSourceId = "test-data-source-id-" + Math.random();
      const mockConnectorId = "test-connector-id-" + Math.random();
      const mockSystemKey = await KeyFactory.system(globalGroup);

      // Create front DataSourceResource
      const dataSourceView =
        await DataSourceViewResource.createDataSourceAndDefaultView(
          {
            assistantDefaultSelected:
              isConnectorProviderAssistantDefaultSelected("dust_project"),
            connectorProvider: "dust_project",
            description: `Conversations from project ${projectSpace.sId}`,
            dustAPIProjectId: mockProjectId.toString(),
            dustAPIDataSourceId: mockDataSourceId,
            name: getProjectConversationsDatasourceName(projectSpace),
            workspaceId: workspace.id,
          },
          projectSpace,
          adminAuth.user()
        );
      const dataSource = dataSourceView.dataSource;
      await dataSource.setConnectorId(mockConnectorId);

      vi.spyOn(
        await import("@app/lib/auth"),
        "getOrCreateSystemApiKey"
      ).mockResolvedValue(new Ok(mockSystemKey));

      // Mock CoreAPI.getDataSource to return success
      vi.spyOn(CoreAPI.prototype, "getDataSource").mockResolvedValue(
        new Ok({
          data_source: {
            data_source_id: mockDataSourceId,
            data_source_internal_id: `internal-${mockDataSourceId}`,
            name: getProjectConversationsDatasourceName(projectSpace),
            project_id: mockProjectId.toString(),
            created: 1234567890,
            updated: 1234567890,
            config: {
              embedder_config: {
                embedder: {
                  max_chunk_size: 512,
                  model_id: "text-embedding-ada-002",
                  provider_id: "openai",
                  splitter_id: "base_v0",
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

      // Mock upsertDataSourceFolder (idempotent, will create if missing)
      const upsertFolderSpy = vi
        .spyOn(CoreAPI.prototype, "upsertDataSourceFolder")
        .mockResolvedValue(
          new Ok({
            folder: {
              data_source_id: mockDataSourceId,
              folder_id: "context",
              parent_id: null,
              parents: ["context"],
              title: "Context",
              timestamp: 1234567890,
            },
          })
        );

      // Mock getConnector to return success (connector exists)
      vi.spyOn(ConnectorsAPI.prototype, "getConnector").mockResolvedValue(
        new Ok({
          id: mockConnectorId,
          type: "dust_project",
          workspaceId: workspace.sId,
          dataSourceId: dataSource.sId,
          connectionId: projectSpace.sId,
          useProxy: false,
          configuration: null,
          updatedAt: Date.now(),
        })
      );

      const result = await createDataSourceAndConnectorForProject(
        adminAuth,
        projectSpace
      );

      expect(result.isOk()).toBe(true);

      // Verify folder was upserted (created if missing)
      expect(upsertFolderSpy).toHaveBeenCalledTimes(1);
      expect(upsertFolderSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: mockProjectId.toString(),
          dataSourceId: mockDataSourceId,
          folderId: "project-context-folder",
          parentId: null,
          parents: ["project-context-folder"],
          timestamp: null,
          providerVisibility: null,
          title: "Context",
        })
      );

      // Verify only one dust_project datasource exists
      const finalDataSources = await DataSourceResource.listBySpace(
        adminAuth,
        projectSpace,
        undefined,
        "dust_project"
      );
      expect(finalDataSources.length).toBe(1);

      upsertFolderSpy.mockRestore();
    });
  });
});
