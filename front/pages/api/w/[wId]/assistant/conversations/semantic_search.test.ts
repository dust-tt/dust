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
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { DEFAULT_EMBEDDING_PROVIDER_ID } from "@app/types/assistant/models/embedding";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { CoreAPI, EMBEDDING_CONFIGS } from "@app/types/core/core_api";
import type { CoreAPIDocument } from "@app/types/core/data_source";
import { DEFAULT_QDRANT_CLUSTER } from "@app/types/core/data_source";
import { Err, Ok } from "@app/types/shared/result";

import handler from "./semantic_search";

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

function createMockDocument(
  dataSourceId: string,
  conversationId: string,
  score: number
): CoreAPIDocument {
  return {
    data_source_id: dataSourceId,
    created: Date.now(),
    document_id: `doc-${Math.random()}`,
    parents: [],
    parent_id: null,
    timestamp: Date.now(),
    tags: [`conversation:${conversationId}`],
    hash: `hash-${Math.random()}`,
    text_size: 100,
    chunk_count: 1,
    chunks: [{ text: "test content", hash: "chunk-hash", offset: 0, score }],
    title: "Test Document",
    mime_type: null,
  };
}

describe("GET /api/w/[wId]/assistant/conversations/semantic_search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Parameter Validation", () => {
    it("returns 400 when query parameter is missing", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      req.query.wId = workspace.sId;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });

    it("returns 400 when query parameter is empty", async () => {
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

    it("returns 400 when limit exceeds max (100)", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      req.query.wId = workspace.sId;
      req.query.query = "test";
      req.query.limit = "101";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      expect(res._getJSONData().error.type).toBe("invalid_request_error");
    });

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
  });

  describe("Empty Results", () => {
    it("returns empty array when no project spaces exist", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      req.query.wId = workspace.sId;
      req.query.query = "test query";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.conversations).toHaveLength(0);
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
  });

  describe("Success Cases", () => {
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
      const conv3 = await ConversationFactory.create(authenticator, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
        spaceId: projectSpace.id,
      });

      vi.spyOn(CoreAPI.prototype, "bulkSearchDataSources").mockResolvedValue(
        new Ok({
          documents: [
            createMockDocument(mockDataSourceId, conv2.sId, 0.5),
            createMockDocument(mockDataSourceId, conv3.sId, 0.9),
            createMockDocument(mockDataSourceId, conv1.sId, 0.7),
          ],
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

    it("searches across multiple project spaces", async () => {
      const { req, res, workspace, user, authenticator, globalGroup } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "admin",
        });

      const projectSpace1 = await SpaceFactory.project(workspace);
      const projectSpace2 = await SpaceFactory.project(workspace);

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      let addMembersRes = await projectSpace1.addMembers(adminAuth, {
        userIds: [user.sId],
      });
      if (!addMembersRes.isOk()) {
        throw new Error("Failed to add user to space 1");
      }
      addMembersRes = await projectSpace2.addMembers(adminAuth, {
        userIds: [user.sId],
      });
      if (!addMembersRes.isOk()) {
        throw new Error("Failed to add user to space 2");
      }

      await authenticator.refresh();

      req.query.wId = workspace.sId;
      req.query.query = "test query";

      const { mockDataSourceId: dsId1 } = await setupDataSourceMocks(
        workspace,
        globalGroup
      );
      await createDataSourceAndConnectorForProject(
        authenticator,
        projectSpace1
      );

      const { mockDataSourceId: dsId2 } = await setupDataSourceMocks(
        workspace,
        globalGroup
      );
      await createDataSourceAndConnectorForProject(
        authenticator,
        projectSpace2
      );

      const conv1 = await ConversationFactory.create(authenticator, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
        spaceId: projectSpace1.id,
      });
      const conv2 = await ConversationFactory.create(authenticator, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
        spaceId: projectSpace2.id,
      });

      vi.spyOn(CoreAPI.prototype, "bulkSearchDataSources").mockResolvedValue(
        new Ok({
          documents: [
            createMockDocument(dsId1, conv1.sId, 0.9),
            createMockDocument(dsId2, conv2.sId, 0.8),
          ],
        })
      );

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.conversations).toHaveLength(2);

      const spaceNames = data.conversations.map(
        (c: { spaceName: string }) => c.spaceName
      );
      expect(spaceNames).toContain(projectSpace1.name);
      expect(spaceNames).toContain(projectSpace2.name);
    });
  });

  describe("Error Handling", () => {
    it("returns 500 when CoreAPI.bulkSearchDataSources fails", async () => {
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
        createMockDocument(mockDataSourceId, conv1.sId, 0.7),
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

    it("excludes conversations from spaces user cannot read", async () => {
      const { req, res, workspace, user, authenticator, globalGroup } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "user",
        });

      const permittedSpace = await SpaceFactory.project(workspace);
      const unpermittedSpace = await SpaceFactory.project(workspace);

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const addMembersRes = await permittedSpace.addMembers(adminAuth, {
        userIds: [user.sId],
      });
      if (!addMembersRes.isOk()) {
        throw new Error("Failed to add user to permitted space");
      }

      await authenticator.refresh();

      req.query.wId = workspace.sId;
      req.query.query = "test query";

      const { mockDataSourceId: permittedDsId } = await setupDataSourceMocks(
        workspace,
        globalGroup
      );
      await createDataSourceAndConnectorForProject(
        authenticator,
        permittedSpace
      );

      const conv1 = await ConversationFactory.create(authenticator, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
        spaceId: permittedSpace.id,
      });

      const unpermittedAdminAuth =
        await Authenticator.internalAdminForWorkspace(workspace.sId);

      // Create a separate admin user to add to the unpermitted space
      // (so the regular user doesn't have access)
      const adminUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, adminUser, {
        role: "admin",
      });
      const addUnpermittedRes = await unpermittedSpace.addMembers(
        unpermittedAdminAuth,
        {
          userIds: [adminUser.sId],
        }
      );
      if (!addUnpermittedRes.isOk()) {
        throw new Error("Failed to add admin to unpermitted space");
      }
      const unpermittedAdminUserAuth =
        await Authenticator.fromUserIdAndWorkspaceId(
          adminUser.sId,
          workspace.sId
        );

      const { mockDataSourceId: unpermittedDsId } = await setupDataSourceMocks(
        workspace,
        globalGroup
      );
      await createDataSourceAndConnectorForProject(
        unpermittedAdminUserAuth,
        unpermittedSpace
      );

      const conv2 = await ConversationFactory.create(unpermittedAdminUserAuth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
        spaceId: unpermittedSpace.id,
      });

      vi.spyOn(CoreAPI.prototype, "bulkSearchDataSources").mockResolvedValue(
        new Ok({
          documents: [
            createMockDocument(permittedDsId, conv1.sId, 0.9),
            createMockDocument(unpermittedDsId, conv2.sId, 0.8),
          ],
        })
      );

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.conversations).toHaveLength(1);
      expect(data.conversations[0].sId).toBe(conv1.sId);
      expect(data.conversations[0].spaceName).toBe(permittedSpace.name);
    });

    it("excludes conversations from projects admin can read but is not a member of", async () => {
      const { req, res, workspace, user, authenticator, globalGroup } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "admin",
        });

      const memberSpace = await SpaceFactory.project(workspace);
      const nonMemberSpace = await SpaceFactory.project(workspace);

      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      const addMembersRes = await memberSpace.addMembers(adminAuth, {
        userIds: [user.sId],
      });
      if (!addMembersRes.isOk()) {
        throw new Error("Failed to add admin to member space");
      }

      await authenticator.refresh();

      req.query.wId = workspace.sId;
      req.query.query = "test query";

      const { mockDataSourceId: memberDsId } = await setupDataSourceMocks(
        workspace,
        globalGroup
      );
      await createDataSourceAndConnectorForProject(authenticator, memberSpace);

      const conv1 = await ConversationFactory.create(authenticator, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
        spaceId: memberSpace.id,
      });

      // Create a separate admin user to add to the non-member space
      // (so the test admin user doesn't have access)
      const otherAdminUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherAdminUser, {
        role: "admin",
      });
      const addNonMemberRes = await nonMemberSpace.addMembers(adminAuth, {
        userIds: [otherAdminUser.sId],
      });
      if (!addNonMemberRes.isOk()) {
        throw new Error("Failed to add admin to non-member space");
      }
      const otherAdminUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherAdminUser.sId,
        workspace.sId
      );

      const { mockDataSourceId: nonMemberDsId } = await setupDataSourceMocks(
        workspace,
        globalGroup
      );
      await createDataSourceAndConnectorForProject(
        otherAdminUserAuth,
        nonMemberSpace
      );

      const conv2 = await ConversationFactory.create(otherAdminUserAuth, {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        messagesCreatedAt: [new Date()],
        spaceId: nonMemberSpace.id,
      });

      vi.spyOn(CoreAPI.prototype, "bulkSearchDataSources").mockResolvedValue(
        new Ok({
          documents: [
            createMockDocument(memberDsId, conv1.sId, 0.9),
            createMockDocument(nonMemberDsId, conv2.sId, 0.8),
          ],
        })
      );

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.conversations).toHaveLength(1);
      expect(data.conversations[0].sId).toBe(conv1.sId);
      expect(data.conversations[0].spaceName).toBe(memberSpace.name);
    });
  });
});
