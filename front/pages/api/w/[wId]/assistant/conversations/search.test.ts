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

import {
  ConversationModel,
  ConversationParticipantModel,
} from "@app/lib/models/agent/conversation";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";

import handler from "./search";

async function createConversationWithTitle(
  authenticator: Parameters<typeof ConversationFactory.create>[0],
  options: Parameters<typeof ConversationFactory.create>[1],
  title: string,
  userId: number
) {
  const conversation = await ConversationFactory.create(authenticator, options);
  await ConversationModel.update({ title }, { where: { id: conversation.id } });

  const workspaceId = authenticator.getNonNullableWorkspace().id;
  await ConversationParticipantModel.create({
    conversationId: conversation.id,
    userId,
    workspaceId,
    action: "posted",
    unread: false,
    actionRequired: false,
  });

  return { ...conversation, title };
}

describe("GET /api/w/[wId]/assistant/conversations/search", () => {
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

    it("ignores conversation kill switch on static conversation routes", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      const updateResult = await WorkspaceResource.updateMetadata(
        workspace.id,
        {
          killSwitched: {
            conversationIds: ["search"],
          },
        }
      );
      if (updateResult.isErr()) {
        throw updateResult.error;
      }

      req.query.wId = workspace.sId;
      req.query.query = "nonexistent";
      req.query.cId = "search";
      req.url = `/api/w/${workspace.sId}/assistant/conversations/search?query=nonexistent&cId=search`;

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData().conversations).toEqual([]);
    });
  });

  describe("Empty Results", () => {
    it("returns empty array when no conversations exist", async () => {
      const { req, res, workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      req.query.wId = workspace.sId;
      req.query.query = "nonexistent";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.conversations).toHaveLength(0);
      expect(data.hasMore).toBe(false);
      expect(data.lastValue).toBeNull();
    });

    it("returns empty array when query does not match any title", async () => {
      const { req, res, workspace, authenticator, user } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "admin",
        });

      await createConversationWithTitle(
        authenticator,
        {
          agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
          messagesCreatedAt: [new Date()],
        },
        "My Important Meeting",
        user.id
      );

      req.query.wId = workspace.sId;
      req.query.query = "zzz nonexistent zzz";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.conversations).toHaveLength(0);
    });
  });

  describe("Success Cases", () => {
    it("returns conversations matching the query in title", async () => {
      const { req, res, workspace, authenticator, user } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "admin",
        });

      const conv1 = await createConversationWithTitle(
        authenticator,
        {
          agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
          messagesCreatedAt: [new Date()],
        },
        "Discussion about testing",
        user.id
      );

      await createConversationWithTitle(
        authenticator,
        {
          agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
          messagesCreatedAt: [new Date()],
        },
        "Random conversation",
        user.id
      );

      const conv3 = await createConversationWithTitle(
        authenticator,
        {
          agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
          messagesCreatedAt: [new Date()],
        },
        "Testing best practices",
        user.id
      );

      req.query.wId = workspace.sId;
      req.query.query = "testing";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.conversations).toHaveLength(2);

      const sIds = data.conversations.map((c: { sId: string }) => c.sId);
      expect(sIds).toContain(conv1.sId);
      expect(sIds).toContain(conv3.sId);
    });

    it("performs case-insensitive search", async () => {
      const { req, res, workspace, authenticator, user } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "admin",
        });

      const conv = await createConversationWithTitle(
        authenticator,
        {
          agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
          messagesCreatedAt: [new Date()],
        },
        "UPPERCASE Title Here",
        user.id
      );

      req.query.wId = workspace.sId;
      req.query.query = "uppercase";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.conversations).toHaveLength(1);
      expect(data.conversations[0].sId).toBe(conv.sId);
    });

    it("returns spaceName as null for all conversations", async () => {
      const { req, res, workspace, authenticator, user } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "admin",
        });

      await createConversationWithTitle(
        authenticator,
        {
          agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
          messagesCreatedAt: [new Date()],
        },
        "Test conversation",
        user.id
      );

      req.query.wId = workspace.sId;
      req.query.query = "Test";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.conversations).toHaveLength(1);
      expect(data.conversations[0].spaceName).toBeNull();
    });
  });

  describe("Pagination", () => {
    it("respects limit parameter", async () => {
      const { req, res, workspace, authenticator, user } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "admin",
        });

      for (let i = 0; i < 5; i++) {
        await createConversationWithTitle(
          authenticator,
          {
            agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
            messagesCreatedAt: [new Date()],
          },
          `Test conversation ${i}`,
          user.id
        );
      }

      req.query.wId = workspace.sId;
      req.query.query = "Test";
      req.query.limit = "2";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.conversations).toHaveLength(2);
      expect(data.hasMore).toBe(true);
      expect(data.lastValue).not.toBeNull();
    });

    it("returns hasMore=false when all results fit in limit", async () => {
      const { req, res, workspace, authenticator, user } =
        await createPrivateApiMockRequest({
          method: "GET",
          role: "admin",
        });

      await createConversationWithTitle(
        authenticator,
        {
          agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
          messagesCreatedAt: [new Date()],
        },
        "Single test conversation",
        user.id
      );

      req.query.wId = workspace.sId;
      req.query.query = "test";
      req.query.limit = "10";

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = res._getJSONData();
      expect(data.conversations).toHaveLength(1);
      expect(data.hasMore).toBe(false);
    });
  });
});
