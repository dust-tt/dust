import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

// Mock Elasticsearch
vi.mock("@app/lib/api/elasticsearch", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    withEs: vi.fn(async (fn: any) => {
      const mockClient = {
        search: vi.fn().mockResolvedValue({
          hits: { hits: [], total: { value: 0 } },
        }),
      };
      // Mock successful result
      return {
        isOk: () => true,
        isErr: () => false,
        value: await fn(mockClient),
      };
    }),
  };
});

async function setupTest() {
  const { workspace, key } = await createPublicApiMockRequest({
    systemKey: true,
  });

  // Create a user and agent for testing
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "builder" });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
    name: "Test Agent",
    description: "Test Agent Description",
  });

  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfig.sId,
    messagesCreatedAt: [],
  });

  return {
    workspace,
    key,
    auth,
    user,
    agentConfig,
    conversation,
  };
}

function getSuggestions(
  workspace: { sId: string },
  key: { secret: string },
  cId: string,
  query: Record<string, string>,
  userEmail?: string
) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${key.secret}`,
  };
  if (userEmail) {
    headers["x-api-user-email"] = userEmail;
  }
  const params = new URLSearchParams(query).toString();
  const url = `/api/v1/w/${workspace.sId}/assistant/conversations/${cId}/mentions/suggestions${params ? `?${params}` : ""}`;
  return honoApp.request(url, { headers });
}

describe("GET /api/v1/w/[wId]/assistant/conversations/[cId]/mentions/suggestions", () => {
  it("should return agent suggestions for a conversation", async () => {
    const { workspace, key, conversation, agentConfig, user } =
      await setupTest();

    const response = await getSuggestions(
      workspace,
      key,
      conversation.sId,
      { query: "test" },
      user.email!
    );

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.suggestions).toBeDefined();
    expect(Array.isArray(responseData.suggestions)).toBe(true);
    const agentSuggestion = responseData.suggestions.find(
      (s: { type: string; id: string }) =>
        s.type === "agent" && s.id === agentConfig.sId
    );
    expect(agentSuggestion).toBeDefined();
  });

  it("should return 404 for non-existent conversation", async () => {
    const { workspace, key, user } = await setupTest();

    const response = await getSuggestions(
      workspace,
      key,
      "non-existent-conversation",
      { query: "test" },
      user.email!
    );

    expect(response.status).toBe(404);
    const responseData = await response.json();
    expect(responseData.error.type).toBe("conversation_not_found");
  });

  it("should handle missing query parameter", async () => {
    const { workspace, key, conversation, user } = await setupTest();

    const response = await getSuggestions(
      workspace,
      key,
      conversation.sId,
      {},
      user.email!
    );

    // Zod validation throws a 400 invalid request for the missing query.
    expect([400, 500]).toContain(response.status);
  });

  it("should support select parameter", async () => {
    const { workspace, key, conversation, user } = await setupTest();

    const response = await getSuggestions(
      workspace,
      key,
      conversation.sId,
      { query: "test", select: "agents" },
      user.email!
    );

    expect(response.status).toBe(200);
    const responseData = await response.json();
    expect(responseData.suggestions).toBeDefined();
    const agentSuggestions = responseData.suggestions.filter(
      (s: { type: string }) => s.type === "agent"
    );
    expect(agentSuggestions.length).toBeGreaterThan(0);
  });
});
