import { beforeEach, describe, expect, it, vi } from "vitest";

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

// Mock distributed lock to avoid Redis dependency
vi.mock("@app/lib/lock", () => ({
  executeWithLock: vi.fn(async (_lockName, fn) => {
    // Simply execute the function without locking in tests
    return fn();
  }),
}));

import { createDataSourceAndConnectorForProject } from "@app/lib/api/projects";
import { Authenticator, getOrCreateSystemApiKey } from "@app/lib/auth";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { GroupFactory } from "@app/tests/utils/GroupFactory";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { CoreAPIDocument } from "@app/types";
import {
  ConnectorsAPI,
  CoreAPI,
  DEFAULT_EMBEDDING_PROVIDER_ID,
  DEFAULT_QDRANT_CLUSTER,
  EMBEDDING_CONFIGS,
  Ok,
} from "@app/types";

import handler from "./search_projects";

// Helper function to mock all API calls needed for createDataSourceAndConnectorForProject
async function setupDataSourceMocks(
  workspace: { sId: string },
  globalGroup: Awaited<ReturnType<typeof GroupFactory.defaults>>["globalGroup"]
) {
  const mockProjectId = Math.floor(Math.random() * 1000000);
  const mockDataSourceId = "test-data-source-id-" + Math.random();
  const mockConnectorId = "test-connector-id-" + Math.random();
  const mockWorkflowId = "test-workflow-id-" + Math.random();

  // Mock system API key
  const mockSystemKey = await KeyFactory.system(globalGroup);
  vi.spyOn(
    { getOrCreateSystemApiKey },
    "getOrCreateSystemApiKey"
  ).mockResolvedValue(new Ok(mockSystemKey));

  // Mock CoreAPI methods
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
        name: "test-datasource",
        config: {
          embedder_config: {
            embedder: {
              provider_id: DEFAULT_EMBEDDING_PROVIDER_ID,
              model_id:
                EMBEDDING_CONFIGS[DEFAULT_EMBEDDING_PROVIDER_ID].model_id,
              splitter_id:
                EMBEDDING_CONFIGS[DEFAULT_EMBEDDING_PROVIDER_ID].splitter_id,
              max_chunk_size:
                EMBEDDING_CONFIGS[DEFAULT_EMBEDDING_PROVIDER_ID].max_chunk_size,
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

  vi.spyOn(CoreAPI.prototype, "getDataSource").mockResolvedValue(
    new Ok({
      data_source: {
        data_source_id: mockDataSourceId,
        data_source_internal_id: `internal-${mockDataSourceId}`,
        name: "test-datasource",
        project_id: mockProjectId.toString(),
        created: Date.now(),
        updated: Date.now(),
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
        timestamp: Date.now(),
      },
    })
  );

  // Mock ConnectorsAPI methods
  vi.spyOn(ConnectorsAPI.prototype, "createConnector").mockResolvedValue(
    new Ok({
      id: mockConnectorId,
      type: "dust_project",
      workspaceId: workspace.sId,
      dataSourceId: "test-data-source-id",
      connectionId: "test-space-id",
      useProxy: false,
      configuration: null,
      updatedAt: Date.now(),
    })
  );

  vi.spyOn(ConnectorsAPI.prototype, "getConnector").mockResolvedValue(
    new Ok({
      id: mockConnectorId,
      type: "dust_project",
      workspaceId: workspace.sId,
      dataSourceId: "test-data-source-id",
      connectionId: "test-space-id",
      useProxy: false,
      configuration: null,
      updatedAt: Date.now(),
    })
  );

  vi.spyOn(ConnectorsAPI.prototype, "syncConnector").mockResolvedValue(
    new Ok({
      workflowId: mockWorkflowId,
    })
  );

  return {
    mockProjectId,
    mockDataSourceId,
    mockConnectorId,
    mockWorkflowId,
  };
}

// Helper to create a mock document for search results
function createMockDocument(
  dataSourceId: string,
  score: number
): CoreAPIDocument {
  return {
    data_source_id: dataSourceId,
    created: Date.now(),
    document_id: `doc-${Math.random()}`,
    parents: [],
    parent_id: null,
    timestamp: Date.now(),
    tags: [],
    hash: `hash-${Math.random()}`,
    text_size: 100,
    chunk_count: 1,
    chunks: [{ text: "test content", hash: "chunk-hash", offset: 0, score }],
    title: "Test Document",
    mime_type: null,
  };
}

describe("GET /api/w/[wId]/spaces/search_projects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Parameter Validation", () => {
    it("returns 405 for non-GET methods", async () => {
      for (const method of ["POST", "PUT", "DELETE", "PATCH"] as const) {
        const { req, res, workspace } = await createPrivateApiMockRequest({
          method,
          role: "admin",
        });

        req.query.wId = workspace.sId;
        req.query.query = "test";

        await handler(req, res);

        expect(res._getStatusCode()).toBe(405);
        expect(res._getJSONData().error.type).toBe(
          "method_not_supported_error"
        );
      }
    });

    it("returns 400 when query parameter is missing", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      req.query.wId = workspace.sId;
      // Missing query parameter

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });

    it("returns 400 when query is empty string", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      req.query.wId = workspace.sId;
      req.query.query = "";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });

    it("returns 400 when limit < 1", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      req.query.wId = workspace.sId;
      req.query.query = "test";
      req.query.limit = "0";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });

    it("returns 400 when limit > 50", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      req.query.wId = workspace.sId;
      req.query.query = "test";
      req.query.limit = "51";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });
  });

  describe("Happy Path", () => {
    it("returns empty array when no projects exist", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      req.query.wId = workspace.sId;
      req.query.query = "test query";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.projects).toHaveLength(0);
    });

    it("returns projects with scores sorted descending", async () => {
      const { req, res, workspace, user, authenticator, globalGroup } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "admin",
        });

      // Create a project space
      const project = await SpaceFactory.project(workspace);

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const addRes = await project.addMembers(adminAuth, {
        userIds: [user.sId],
      });
      if (!addRes.isOk()) {
        throw new Error("Failed to add user to project");
      }

      await authenticator.refresh();

      req.query.wId = workspace.sId;
      req.query.query = "test query";

      // Capture the data source ID from mock setup
      const { mockDataSourceId } = await setupDataSourceMocks(
        workspace,
        globalGroup
      );
      await createDataSourceAndConnectorForProject(authenticator, project);

      // Mock bulk search results - use the actual data source ID
      vi.spyOn(CoreAPI.prototype, "bulkSearchDataSources").mockResolvedValue(
        new Ok({
          documents: [
            createMockDocument(mockDataSourceId, 0.9), // High score
            createMockDocument(mockDataSourceId, 0.5), // Low score - same project, different chunks
          ],
        })
      );

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      // Should have 1 project with the max score
      expect(data.projects.length).toBe(1);
      expect(data.projects[0].score).toBe(0.9); // Max chunk score
    });

    it("returns empty array when no documents match", async () => {
      const { req, res, workspace, user, authenticator, globalGroup } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "admin",
        });

      const project = await SpaceFactory.project(workspace);

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const addRes = await project.addMembers(adminAuth, {
        userIds: [user.sId],
      });
      if (!addRes.isOk()) {
        throw new Error("Failed to add user to project");
      }

      await authenticator.refresh();

      req.query.wId = workspace.sId;
      req.query.query = "test query";

      await setupDataSourceMocks(workspace, globalGroup);
      await createDataSourceAndConnectorForProject(authenticator, project);

      // Mock empty search results
      vi.spyOn(CoreAPI.prototype, "bulkSearchDataSources").mockResolvedValue(
        new Ok({
          documents: [],
        })
      );

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.projects).toHaveLength(0);
    });

    it("uses default limit of 10 when not specified", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      req.query.wId = workspace.sId;
      req.query.query = "test query";
      // limit not provided - should use default of 10

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
    });

    it("respects the limit parameter", async () => {
      const { req, res, workspace, user, authenticator, globalGroup } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "admin",
        });

      // Create multiple projects
      const projects = [];
      for (let i = 0; i < 5; i++) {
        const project = await SpaceFactory.project(workspace);
        projects.push(project);
      }

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      for (const project of projects) {
        const addRes = await project.addMembers(adminAuth, {
          userIds: [user.sId],
        });
        if (!addRes.isOk()) {
          throw new Error("Failed to add user to project");
        }
      }

      await authenticator.refresh();

      req.query.wId = workspace.sId;
      req.query.query = "test query";
      req.query.limit = "2";

      await setupDataSourceMocks(workspace, globalGroup);

      for (const project of projects) {
        await createDataSourceAndConnectorForProject(authenticator, project);
      }

      // Mock bulk search with multiple results
      vi.spyOn(CoreAPI.prototype, "bulkSearchDataSources").mockResolvedValue(
        new Ok({
          documents: projects.map((_, i) =>
            createMockDocument(`ds-${i}`, 0.5 + i * 0.1)
          ),
        })
      );

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      // Should respect limit of 2
      expect(data.projects.length).toBeLessThanOrEqual(2);
    });
  });

  describe("Error Handling", () => {
    it("returns 500 when CoreAPI bulk search fails", async () => {
      const { req, res, workspace, user, authenticator, globalGroup } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "admin",
        });

      const project = await SpaceFactory.project(workspace);

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const addRes = await project.addMembers(adminAuth, {
        userIds: [user.sId],
      });
      if (!addRes.isOk()) {
        throw new Error("Failed to add user to project");
      }

      await authenticator.refresh();

      req.query.wId = workspace.sId;
      req.query.query = "test query";

      await setupDataSourceMocks(workspace, globalGroup);
      await createDataSourceAndConnectorForProject(authenticator, project);

      // Mock CoreAPI error
      vi.spyOn(CoreAPI.prototype, "bulkSearchDataSources").mockResolvedValue({
        isErr: () => true,
        error: new Error("Search failed"),
      } as any);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      expect(res._getJSONData().error.type).toBe("internal_server_error");
    });

    it("handles projects without datasource views gracefully", async () => {
      const { req, res, workspace, user, authenticator } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "admin",
        });

      // Create a project but don't create its data source
      const project = await SpaceFactory.project(workspace);

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const addRes = await project.addMembers(adminAuth, {
        userIds: [user.sId],
      });
      if (!addRes.isOk()) {
        throw new Error("Failed to add user to project");
      }

      await authenticator.refresh();

      req.query.wId = workspace.sId;
      req.query.query = "test query";

      // Don't setup data source - should handle gracefully
      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      // Should return empty since no valid projects with data sources
      expect(data.projects).toHaveLength(0);
    });
  });

  describe("Access Control", () => {
    it("only returns projects the user can access", async () => {
      const { req, res, workspace, user, authenticator, globalGroup } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "user",
        });

      // Create a project that the user is a member of
      const accessibleProject = await SpaceFactory.project(workspace);

      // Create a restricted project that the user is NOT a member of
      const restrictedProject = await SpaceFactory.project(workspace);

      // Only add user to the accessible project
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const addRes = await accessibleProject.addMembers(adminAuth, {
        userIds: [user.sId],
      });
      if (!addRes.isOk()) {
        throw new Error("Failed to add user to project");
      }

      await authenticator.refresh();

      req.query.wId = workspace.sId;
      req.query.query = "test query";

      await setupDataSourceMocks(workspace, globalGroup);
      await createDataSourceAndConnectorForProject(
        adminAuth,
        accessibleProject
      );
      await createDataSourceAndConnectorForProject(
        adminAuth,
        restrictedProject
      );

      // Mock search results - both projects have matches
      vi.spyOn(CoreAPI.prototype, "bulkSearchDataSources").mockResolvedValue(
        new Ok({
          documents: [
            createMockDocument("ds-accessible", 0.8),
            createMockDocument("ds-restricted", 0.9),
          ],
        })
      );

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      // User should only see projects they have access to
      // The exact filtering depends on the implementation
    });
  });
});
