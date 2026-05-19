import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConversationModel,
  ConversationParticipantModel,
} from "@app/lib/models/agent/conversation";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";

import { honoApp } from "@front-api/app";

async function createConversationWithTitle(
  auth: Parameters<typeof ConversationFactory.create>[0],
  options: Parameters<typeof ConversationFactory.create>[1],
  title: string,
  userId: number
) {
  const conversation = await ConversationFactory.create(auth, options);
  await ConversationModel.update({ title }, { where: { id: conversation.id } });

  const workspaceId = auth.getNonNullableWorkspace().id;
  await ConversationParticipantModel.create({
    conversationId: conversation.id,
    userId,
    workspaceId,
    action: "posted",
    actionRequired: false,
  });

  return { ...conversation, title };
}

function search(workspace: { sId: string }, query: Record<string, string>) {
  const qs = new URLSearchParams(query).toString();
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/search?${qs}`
  );
}

describe("GET /api/w/:wId/assistant/conversations/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Parameter Validation", () => {
    it("returns 400 when query parameter is missing", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      const response = await search(workspace, {});

      expect(response.status).toBe(400);
      expect((await response.json()).error.type).toBe("invalid_request_error");
    });

    it("returns 400 when query parameter is empty", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      const response = await search(workspace, { query: "" });

      expect(response.status).toBe(400);
      expect((await response.json()).error.type).toBe("invalid_request_error");
    });

    it("returns 400 when limit exceeds max (100)", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      const response = await search(workspace, { query: "test", limit: "101" });

      expect(response.status).toBe(400);
      expect((await response.json()).error.type).toBe("invalid_request_error");
    });
  });

  describe("Empty Results", () => {
    it("returns empty array when no conversations exist", async () => {
      const { workspace } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      const response = await search(workspace, { query: "nonexistent" });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.conversations).toHaveLength(0);
      expect(data.hasMore).toBe(false);
      expect(data.lastValue).toBeNull();
    });

    it("returns empty array when query does not match any title", async () => {
      const { workspace, auth, user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      await createConversationWithTitle(
        auth,
        {
          agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
          messagesCreatedAt: [new Date()],
        },
        "My Important Meeting",
        user.id
      );

      const response = await search(workspace, {
        query: "zzz nonexistent zzz",
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.conversations).toHaveLength(0);
    });
  });

  describe("Success Cases", () => {
    it("returns conversations matching the query in title", async () => {
      const { workspace, auth, user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      const conv1 = await createConversationWithTitle(
        auth,
        {
          agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
          messagesCreatedAt: [new Date()],
        },
        "Discussion about testing",
        user.id
      );

      await createConversationWithTitle(
        auth,
        {
          agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
          messagesCreatedAt: [new Date()],
        },
        "Random conversation",
        user.id
      );

      const conv3 = await createConversationWithTitle(
        auth,
        {
          agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
          messagesCreatedAt: [new Date()],
        },
        "Testing best practices",
        user.id
      );

      const response = await search(workspace, { query: "testing" });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.conversations).toHaveLength(2);

      const sIds = data.conversations.map((c: { sId: string }) => c.sId);
      expect(sIds).toContain(conv1.sId);
      expect(sIds).toContain(conv3.sId);
    });

    it("performs case-insensitive search", async () => {
      const { workspace, auth, user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      const conv = await createConversationWithTitle(
        auth,
        {
          agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
          messagesCreatedAt: [new Date()],
        },
        "UPPERCASE Title Here",
        user.id
      );

      const response = await search(workspace, { query: "uppercase" });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.conversations).toHaveLength(1);
      expect(data.conversations[0].sId).toBe(conv.sId);
    });

    it("returns spaceName as null for all conversations", async () => {
      const { workspace, auth, user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      await createConversationWithTitle(
        auth,
        {
          agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
          messagesCreatedAt: [new Date()],
        },
        "Test conversation",
        user.id
      );

      const response = await search(workspace, { query: "Test" });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.conversations).toHaveLength(1);
      expect(data.conversations[0].spaceName).toBeNull();
    });
  });

  describe("Pagination", () => {
    it("respects limit parameter", async () => {
      const { workspace, auth, user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      for (let i = 0; i < 5; i++) {
        await createConversationWithTitle(
          auth,
          {
            agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
            messagesCreatedAt: [new Date()],
          },
          `Test conversation ${i}`,
          user.id
        );
      }

      const response = await search(workspace, { query: "Test", limit: "2" });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.conversations).toHaveLength(2);
      expect(data.hasMore).toBe(true);
      expect(data.lastValue).not.toBeNull();
    });

    it("returns hasMore=false when all results fit in limit", async () => {
      const { workspace, auth, user } = await createPrivateApiMockRequest({
        method: "GET",
        role: "admin",
      });

      await createConversationWithTitle(
        auth,
        {
          agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
          messagesCreatedAt: [new Date()],
        },
        "Single test conversation",
        user.id
      );

      const response = await search(workspace, { query: "test", limit: "10" });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.conversations).toHaveLength(1);
      expect(data.hasMore).toBe(false);
    });
  });
});
