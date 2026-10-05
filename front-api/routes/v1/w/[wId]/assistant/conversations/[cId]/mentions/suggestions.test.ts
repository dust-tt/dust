import { AGENT_SEARCH_ALIAS_NAME } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

const mockSearch = vi.hoisted(() => vi.fn());

// Mock Elasticsearch so `suggestionsOfMentions` doesn't hit a real cluster.
vi.mock("@app/lib/api/elasticsearch", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/elasticsearch")>();
  return {
    ...actual,
    withEs: vi.fn(
      async (
        fn: (client: { search: typeof mockSearch }) => Promise<unknown>
      ) => {
        const result = await fn({ search: mockSearch });
        return new Ok(result);
      }
    ),
  };
});

async function mockAgentSearchResults(auth: Authenticator, agentIds: string[]) {
  const agents = await AgentResource.fetchByIds(auth, agentIds);
  const documents = agents.map((agent) =>
    agent.toSearchDocument(auth, {
      activeUsersCount: 0,
      editors: [],
      favoriteCount: 0,
      feedbackNegativeCount: 0,
      feedbackPositiveCount: 0,
      lastEditedByUser: null,
      mcpServerViewIds: [],
      skillIds: [],
      tagIds: [],
    })
  );
  mockSearch.mockImplementation(async (request: estypes.SearchRequest) => ({
    hits: {
      hits:
        request.index === AGENT_SEARCH_ALIAS_NAME
          ? documents.map((document) => ({ _source: document }))
          : [],
      total: {
        value: request.index === AGENT_SEARCH_ALIAS_NAME ? documents.length : 0,
      },
    },
  }));
}

async function setupTest() {
  const { workspace, key } = await createPublicApiMockRequest({
    systemKey: true,
  });

  // Create a user and agent for testing
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "user" });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
    name: "Test Agent",
    description: "Test Agent Description",
  });
  await mockAgentSearchResults(auth, [agentConfig.sId]);

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
