import { AGENT_SEARCH_ALIAS_NAME } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { buildNameAutocompleteQuery } from "@app/lib/search/agent_and_skill_queries";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
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

async function setup() {
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

  return {
    workspace,
    key,
    auth,
    user,
    agentConfig,
  };
}

function getSuggestions(
  workspace: { sId: string },
  key: { secret: string },
  userEmail: string,
  query: Record<string, string | string[]>
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) {
      for (const item of v) {
        params.append(k, item);
      }
    } else {
      params.append(k, v);
    }
  }
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/assistant/mentions/suggestions?${params.toString()}`,
    {
      headers: {
        authorization: `Bearer ${key.secret}`,
        "x-api-user-email": userEmail,
      },
    }
  );
}

describe("GET /api/v1/w/[wId]/assistant/mentions/suggestions", () => {
  it("should return agent suggestions", async () => {
    const { workspace, key, user, agentConfig } = await setup();

    const response = await getSuggestions(workspace, key, user.email!, {
      query: "test",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.suggestions).toBeDefined();
    expect(Array.isArray(data.suggestions)).toBe(true);
    const agentSuggestion = data.suggestions.find(
      (s: { type: string; id: string }) =>
        s.type === "agent" && s.id === agentConfig.sId
    );
    expect(agentSuggestion).toBeDefined();
  });

  it("should filter suggestions by query", async () => {
    const { workspace, key, auth, user } = await setup();

    const agentConfig1 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Alpha Agent",
      description: "Alpha Description",
    });
    const agentConfig2 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Beta Agent",
      description: "Beta Description",
    });

    await mockAgentSearchResults(auth, [agentConfig1.sId]);

    const response = await getSuggestions(workspace, key, user.email!, {
      query: "alpha",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    const suggestions = data.suggestions.filter(
      (s: { type: string }) => s.type === "agent"
    );
    const alphaFound = suggestions.some(
      (s: { id: string }) => s.id === agentConfig1.sId
    );
    const betaFound = suggestions.some(
      (s: { id: string }) => s.id === agentConfig2.sId
    );
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        index: AGENT_SEARCH_ALIAS_NAME,
        query: expect.objectContaining({
          bool: expect.objectContaining({
            must: [buildNameAutocompleteQuery("alpha")],
          }),
        }),
      })
    );
    expect(alphaFound).toBe(true);
    expect(betaFound).toBe(false);
  });

  it("should support select parameter for agents only", async () => {
    const { workspace, key, user } = await setup();

    const response = await getSuggestions(workspace, key, user.email!, {
      query: "test",
      select: "agents",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.suggestions).toBeDefined();
    const agentSuggestions = data.suggestions.filter(
      (s: { type: string }) => s.type === "agent"
    );
    expect(agentSuggestions.length).toBeGreaterThan(0);
  });

  it("should support select parameter for users only", async () => {
    const { workspace, key, user } = await setup();

    const response = await getSuggestions(workspace, key, user.email!, {
      query: "test",
      select: "users",
    });

    // Users may or may not be returned depending on feature flags
    // If users are disabled, this may return 200 with empty array or error
    expect([200, 500]).toContain(response.status);
    if (response.status === 200) {
      const data = await response.json();
      expect(data.suggestions).toBeDefined();
      expect(Array.isArray(data.suggestions)).toBe(true);
    }
  });

  it("should support select parameter as array", async () => {
    const { workspace, key, user } = await setup();

    const response = await getSuggestions(workspace, key, user.email!, {
      query: "test",
      select: ["agents", "users"],
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.suggestions).toBeDefined();
    expect(Array.isArray(data.suggestions)).toBe(true);
  });

  it("should handle missing query parameter", async () => {
    const { workspace, key, user } = await setup();

    const response = await getSuggestions(workspace, key, user.email!, {});

    // Zod validation fails, returns 400
    expect([400, 500]).toContain(response.status);
  });
});
