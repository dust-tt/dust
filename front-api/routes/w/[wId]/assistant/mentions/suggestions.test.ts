import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSearch = vi.hoisted(() => vi.fn());

// A favorite absent from the first ES page must still appear in the suggestions.
vi.mock("@app/lib/api/elasticsearch", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/elasticsearch")>();
  return {
    ...actual,
    withEs: async (
      fn: (client: { search: typeof mockSearch }) => Promise<unknown>
    ) => new Ok(await fn({ search: mockSearch })),
  };
});

describe("GET /api/w/:wId/assistant/mentions/suggestions", () => {
  beforeEach(() => {
    mockSearch.mockReset();
    mockSearch.mockResolvedValue({ hits: { hits: [], total: { value: 0 } } });
  });

  it("puts a favorite ahead of a full search page and removes its duplicate", async () => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "new_manage_agents_page");
    const configuration = await AgentConfigurationFactory.createTestAgent(
      auth,
      { name: "Zulu Favorite" }
    );
    const agent = await AgentResource.fetchById(auth, configuration.sId);
    assert(agent);
    const favoriteResult = await agent.setUserFavorite(auth, true);
    expect(favoriteResult.isOk()).toBe(true);
    const document = agent.toSearchDocument(auth, {
      activeUsersCount: 0,
      editors: [user],
      favoriteCount: 1,
      feedbackNegativeCount: 0,
      feedbackPositiveCount: 0,
      lastEditedByUser: user,
      mcpServerViewIds: [],
      skillIds: [],
      tagIds: [],
    });
    mockSearch.mockResolvedValue({
      hits: {
        hits: [
          ...Array.from({ length: 19 }, (_, index) => ({
            _source: {
              ...document,
              agent_id: `other-${index}`,
              name: `Alpha ${index}`,
            },
          })),
          { _source: document },
        ],
        total: { value: 20 },
      },
    });

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/assistant/mentions/suggestions?select=agents`
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.suggestions).toHaveLength(20);
    expect(body.suggestions[0].id).toBe(agent.sId);
    expect(
      body.suggestions.filter(
        (suggestion: { id: string }) => suggestion.id === agent.sId
      )
    ).toHaveLength(1);
  });

  it.each([
    "",
    "   ",
    "other",
  ])("includes favorites outside the ES page only for a blank query: %j", async (query) => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "new_manage_agents_page");
    const configuration = await AgentConfigurationFactory.createTestAgent(
      auth,
      { name: "Zulu Favorite" }
    );
    const agent = await AgentResource.fetchById(auth, configuration.sId);
    assert(agent);
    const favoriteResult = await agent.setUserFavorite(auth, true);
    expect(favoriteResult.isOk()).toBe(true);

    const params = new URLSearchParams({ query, select: "agents" });
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/assistant/mentions/suggestions?${params}`
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(
      body.suggestions.map((suggestion: { id: string }) => suggestion.id)
    ).toEqual(query.trim() ? [] : [agent.sId]);
  });
});
