import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@app/lib/lock", () => ({
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  executeWithLock: vi.fn(async (_lockName, fn) => {
    return fn();
  }),
}));

import { createDataSourceAndConnectorForProject } from "@app/lib/api/projects";
import { Authenticator, getOrCreateSystemApiKey } from "@app/lib/auth";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import type { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { DEFAULT_EMBEDDING_PROVIDER_ID } from "@app/types/assistant/models/embedding";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { CoreAPI, EMBEDDING_CONFIGS } from "@app/types/core/core_api";
import type { CoreAPIDocument } from "@app/types/core/data_source";
import { DEFAULT_QDRANT_CLUSTER } from "@app/types/core/data_source";
import { Err, Ok } from "@app/types/shared/result";

import handler from "./search_conversations";

async function setupDataSourceMocks(
  workspace: { sId: string },
  globalGroup: Awaited<ReturnType<typeof GroupFactory.defaults>>["globalGroup"]
) {
  const mockProjectId = Math.floor(Math.random() * 1000000);
  const mockDataSourceId = "test-data-source-id-" + Math.random();
  const mockConnectorId = "test-connector-id-" + Math.random();
  const mockWorkflowId = "test-workflow-id-" + Math.random();

  const mockSystemKey = await KeyFactory.system(globalGroup);
  vi.spyOn(
    { getOrCreateSystemApiKey },
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

describe("GET /api/w/[wId]/spaces/[spaceId]/search_conversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns conversations ordered by relevance", async () => {
    const { req, res, workspace, user, authenticator, globalGroup } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

    const projectSpace = await SpaceFactory.project(workspace);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const addMembersRes = await projectSpace.addMembers(adminAuth, {
      userIds: [user.sId],
    });
    if (!addMembersRes.isOk()) {
      throw new Error("Failed to add user to space");
    }

    await authenticator.refresh();

    req.query.wId = workspace.sId;
    req.query.spaceId = projectSpace.sId;
    req.query.query = "test query";
    req.query.limit = "10";

    const { mockDataSourceId } = await setupDataSourceMocks(
      workspace,
      globalGroup
    );
    await createDataSourceAndConnectorForProject(authenticator, projectSpace);

    const conv1 = await ConversationFactory.create(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
      spaceId: projectSpace.id,
    });
    const conv2 = await ConversationFactory.create(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
      spaceId: projectSpace.id,
    });
    const conv3 = await ConversationFactory.create(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
      spaceId: projectSpace.id,
    });

    const mockDocuments: CoreAPIDocument[] = [
      {
        data_source_id: mockDataSourceId,
        created: Date.now(),
        document_id: "doc-2",
        parents: [],
        parent_id: null,
        timestamp: Date.now(),
        tags: [`conversation:${conv2.sId}`],
        hash: "hash2",
        text_size: 100,
        chunk_count: 1,
        chunks: [{ text: "test", hash: "chunk-hash", offset: 0, score: 0.5 }],
        title: "Doc 2",
        mime_type: null,
      },
      {
        data_source_id: mockDataSourceId,
        created: Date.now(),
        document_id: "doc-3",
        parents: [],
        parent_id: null,
        timestamp: Date.now(),
        tags: [`conversation:${conv3.sId}`],
        hash: "hash3",
        text_size: 100,
        chunk_count: 1,
        chunks: [{ text: "test", hash: "chunk-hash", offset: 0, score: 0.9 }],
        title: "Doc 3",
        mime_type: null,
      },
      {
        data_source_id: mockDataSourceId,
        created: Date.now(),
        document_id: "doc-1",
        parents: [],
        parent_id: null,
        timestamp: Date.now(),
        tags: [`conversation:${conv1.sId}`],
        hash: "hash1",
        text_size: 100,
        chunk_count: 1,
        chunks: [{ text: "test", hash: "chunk-hash", offset: 0, score: 0.7 }],
        title: "Doc 1",
        mime_type: null,
      },
    ];

    vi.spyOn(CoreAPI.prototype, "bulkSearchDataSources").mockResolvedValue(
      new Ok({
        documents: mockDocuments,
      })
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.conversations).toHaveLength(3);

    expect(data.conversations[0].sId).toBe(conv3.sId);
    expect(data.conversations[1].sId).toBe(conv1.sId);
    expect(data.conversations[2].sId).toBe(conv2.sId);
  });

  it("returns empty array when no conversations found", async () => {
    const { req, res, workspace, user, authenticator, globalGroup } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

    const projectSpace = await SpaceFactory.project(workspace);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const addMembersRes = await projectSpace.addMembers(adminAuth, {
      userIds: [user.sId],
    });
    if (!addMembersRes.isOk()) {
      throw new Error("Failed to add user to space");
    }

    await authenticator.refresh();

    req.query.wId = workspace.sId;
    req.query.spaceId = projectSpace.sId;
    req.query.query = "test query";

    await setupDataSourceMocks(workspace, globalGroup);
    await createDataSourceAndConnectorForProject(authenticator, projectSpace);

    vi.spyOn(CoreAPI.prototype, "bulkSearchDataSources").mockResolvedValue(
      new Ok({
        documents: [],
      })
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.conversations).toHaveLength(0);
  });

  it("returns empty array when documents have no conversation tags", async () => {
    const { req, res, workspace, user, authenticator, globalGroup } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

    const projectSpace = await SpaceFactory.project(workspace);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const addMembersRes = await projectSpace.addMembers(adminAuth, {
      userIds: [user.sId],
    });
    if (!addMembersRes.isOk()) {
      throw new Error("Failed to add user to space");
    }

    await authenticator.refresh();

    req.query.wId = workspace.sId;
    req.query.spaceId = projectSpace.sId;
    req.query.query = "test query";

    const { mockDataSourceId } = await setupDataSourceMocks(
      workspace,
      globalGroup
    );
    await createDataSourceAndConnectorForProject(authenticator, projectSpace);

    const mockDocuments: CoreAPIDocument[] = [
      {
        data_source_id: mockDataSourceId,
        created: Date.now(),
        document_id: "doc-1",
        parents: [],
        parent_id: null,
        timestamp: Date.now(),
        tags: ["other-tag"],
        hash: "hash1",
        text_size: 100,
        chunk_count: 1,
        chunks: [{ text: "test", hash: "chunk-hash", offset: 0, score: 0.7 }],
        title: "Doc 1",
        mime_type: null,
      },
    ];

    vi.spyOn(CoreAPI.prototype, "bulkSearchDataSources").mockResolvedValue(
      new Ok({
        documents: mockDocuments,
      })
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.conversations).toHaveLength(0);
  });

  it("handles documents with multiple chunks and uses max score", async () => {
    const { req, res, workspace, user, authenticator, globalGroup } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

    const projectSpace = await SpaceFactory.project(workspace);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const addMembersRes = await projectSpace.addMembers(adminAuth, {
      userIds: [user.sId],
    });
    if (!addMembersRes.isOk()) {
      throw new Error("Failed to add user to space");
    }

    await authenticator.refresh();

    req.query.wId = workspace.sId;
    req.query.spaceId = projectSpace.sId;
    req.query.query = "test query";

    const { mockDataSourceId } = await setupDataSourceMocks(
      workspace,
      globalGroup
    );
    await createDataSourceAndConnectorForProject(authenticator, projectSpace);

    const conv1 = await ConversationFactory.create(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
      spaceId: projectSpace.id,
    });
    const conv2 = await ConversationFactory.create(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
      spaceId: projectSpace.id,
    });

    const mockDocuments: CoreAPIDocument[] = [
      {
        data_source_id: mockDataSourceId,
        created: Date.now(),
        document_id: "doc-1",
        parents: [],
        parent_id: null,
        timestamp: Date.now(),
        tags: [`conversation:${conv1.sId}`],
        hash: "hash1",
        text_size: 100,
        chunk_count: 2,
        chunks: [
          { text: "test", hash: "chunk-hash-1", offset: 0, score: 0.5 },
          { text: "test", hash: "chunk-hash-2", offset: 10, score: 0.6 },
        ],
        title: "Doc 1",
        mime_type: null,
      },
      {
        data_source_id: mockDataSourceId,
        created: Date.now(),
        document_id: "doc-2",
        parents: [],
        parent_id: null,
        timestamp: Date.now(),
        tags: [`conversation:${conv2.sId}`],
        hash: "hash2",
        text_size: 100,
        chunk_count: 2,
        chunks: [
          { text: "test", hash: "chunk-hash-3", offset: 0, score: 0.3 },
          { text: "test", hash: "chunk-hash-4", offset: 10, score: 0.9 },
        ],
        title: "Doc 2",
        mime_type: null,
      },
    ];

    vi.spyOn(CoreAPI.prototype, "bulkSearchDataSources").mockResolvedValue(
      new Ok({
        documents: mockDocuments,
      })
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.conversations).toHaveLength(2);
    expect(data.conversations[0].sId).toBe(conv2.sId);
    expect(data.conversations[1].sId).toBe(conv1.sId);
  });

  it("handles documents with chunks without scores", async () => {
    const { req, res, workspace, user, authenticator, globalGroup } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

    const projectSpace = await SpaceFactory.project(workspace);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const addMembersRes = await projectSpace.addMembers(adminAuth, {
      userIds: [user.sId],
    });
    if (!addMembersRes.isOk()) {
      throw new Error("Failed to add user to space");
    }

    await authenticator.refresh();

    req.query.wId = workspace.sId;
    req.query.spaceId = projectSpace.sId;
    req.query.query = "test query";

    const { mockDataSourceId } = await setupDataSourceMocks(
      workspace,
      globalGroup
    );
    await createDataSourceAndConnectorForProject(authenticator, projectSpace);

    const conv1 = await ConversationFactory.create(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
      spaceId: projectSpace.id,
    });

    const mockDocuments: CoreAPIDocument[] = [
      {
        data_source_id: mockDataSourceId,
        created: Date.now(),
        document_id: "doc-1",
        parents: [],
        parent_id: null,
        timestamp: Date.now(),
        tags: [`conversation:${conv1.sId}`],
        hash: "hash1",
        text_size: 100,
        chunk_count: 1,
        chunks: [{ text: "test", hash: "chunk-hash", offset: 0, score: null }],
        title: "Doc 1",
        mime_type: null,
      },
    ];

    vi.spyOn(CoreAPI.prototype, "bulkSearchDataSources").mockResolvedValue(
      new Ok({
        documents: mockDocuments,
      })
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.conversations).toHaveLength(0);
  });

  it("validates query parameter is required", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    req.query.wId = workspace.sId;
    req.query.spaceId = projectSpace.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("validates query parameter is not empty", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    req.query.wId = workspace.sId;
    req.query.spaceId = projectSpace.sId;
    req.query.query = "";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("validates limit parameter range", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    req.query.wId = workspace.sId;
    req.query.spaceId = projectSpace.sId;
    req.query.query = "test";
    req.query.limit = "101";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error.type).toBe("invalid_request_error");
  });

  it("uses default limit when not provided", async () => {
    const { req, res, workspace, user, authenticator, globalGroup } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

    const projectSpace = await SpaceFactory.project(workspace);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const addMembersRes = await projectSpace.addMembers(adminAuth, {
      userIds: [user.sId],
    });
    if (!addMembersRes.isOk()) {
      throw new Error("Failed to add user to space");
    }

    await authenticator.refresh();

    req.query.wId = workspace.sId;
    req.query.spaceId = projectSpace.sId;
    req.query.query = "test query";

    await setupDataSourceMocks(workspace, globalGroup);
    await createDataSourceAndConnectorForProject(authenticator, projectSpace);

    const bulkSearchSpy = vi
      .spyOn(CoreAPI.prototype, "bulkSearchDataSources")
      .mockResolvedValue(
        new Ok({
          documents: [],
        })
      );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(bulkSearchSpy).toHaveBeenCalledWith(
      "test query",
      10,
      expect.any(Object),
      false,
      expect.any(Array)
    );
  });

  it("returns 405 for non-GET methods", async () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH"] as const) {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method,
        role: "admin",
      });

      const projectSpace = await SpaceFactory.project(workspace);
      req.query.wId = workspace.sId;
      req.query.spaceId = projectSpace.sId;
      req.query.query = "test";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData().error.type).toBe("method_not_supported_error");
    }
  });

  it("handles CoreAPI search errors", async () => {
    const { req, res, workspace, user, authenticator, globalGroup } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

    const projectSpace = await SpaceFactory.project(workspace);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const addMembersRes = await projectSpace.addMembers(adminAuth, {
      userIds: [user.sId],
    });
    if (!addMembersRes.isOk()) {
      throw new Error("Failed to add user to space");
    }

    await authenticator.refresh();

    req.query.wId = workspace.sId;
    req.query.spaceId = projectSpace.sId;
    req.query.query = "test query";

    await setupDataSourceMocks(workspace, globalGroup);
    await createDataSourceAndConnectorForProject(authenticator, projectSpace);

    vi.spyOn(CoreAPI.prototype, "bulkSearchDataSources").mockResolvedValue(
      new Err({
        code: "internal_server_error",
        message: "Search failed",
      })
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData().error.type).toBe("internal_server_error");
  });

  it("returns empty array when project datasource does not exist", async () => {
    const { req, res, workspace, user, authenticator } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

    const regularSpace = await SpaceFactory.regular(workspace);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const addMembersRes = await regularSpace.addMembers(adminAuth, {
      userIds: [user.sId],
    });
    if (!addMembersRes.isOk()) {
      throw new Error("Failed to add user to space");
    }

    await authenticator.refresh();

    req.query.wId = workspace.sId;
    req.query.spaceId = regularSpace.sId;
    req.query.query = "test query";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.conversations).toHaveLength(0);
  });

  it("filters out conversations that cannot be fetched", async () => {
    const { req, res, workspace, user, authenticator, globalGroup } =
      await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

    const projectSpace = await SpaceFactory.project(workspace);

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const addMembersRes = await projectSpace.addMembers(adminAuth, {
      userIds: [user.sId],
    });
    if (!addMembersRes.isOk()) {
      throw new Error("Failed to add user to space");
    }

    await authenticator.refresh();

    req.query.wId = workspace.sId;
    req.query.spaceId = projectSpace.sId;
    req.query.query = "test query";

    const { mockDataSourceId } = await setupDataSourceMocks(
      workspace,
      globalGroup
    );
    await createDataSourceAndConnectorForProject(authenticator, projectSpace);

    const conv1 = await ConversationFactory.create(authenticator, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      messagesCreatedAt: [new Date()],
      spaceId: projectSpace.id,
    });

    const mockDocuments: CoreAPIDocument[] = [
      {
        data_source_id: mockDataSourceId,
        created: Date.now(),
        document_id: "doc-1",
        parents: [],
        parent_id: null,
        timestamp: Date.now(),
        tags: [`conversation:${conv1.sId}`],
        hash: "hash1",
        text_size: 100,
        chunk_count: 1,
        chunks: [{ text: "test", hash: "chunk-hash", offset: 0, score: 0.7 }],
        title: "Doc 1",
        mime_type: null,
      },
      {
        data_source_id: mockDataSourceId,
        created: Date.now(),
        document_id: "doc-2",
        parents: [],
        parent_id: null,
        timestamp: Date.now(),
        tags: ["conversation:non-existent-id"],
        hash: "hash2",
        text_size: 100,
        chunk_count: 1,
        chunks: [{ text: "test", hash: "chunk-hash", offset: 0, score: 0.8 }],
        title: "Doc 2",
        mime_type: null,
      },
    ];

    vi.spyOn(CoreAPI.prototype, "bulkSearchDataSources").mockResolvedValue(
      new Ok({
        documents: mockDocuments,
      })
    );

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.conversations).toHaveLength(1);
    expect(data.conversations[0].sId).toBe(conv1.sId);
  });

  it("returns 404 for space user cannot read", async () => {
    const { req, res, workspace } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const unpermittedSpace = await SpaceFactory.project(workspace);

    req.query.wId = workspace.sId;
    req.query.spaceId = unpermittedSpace.sId;
    req.query.query = "test query";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("space_not_found");
  });
});
