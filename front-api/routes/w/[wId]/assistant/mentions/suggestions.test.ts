import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSearch = vi.hoisted(() => vi.fn());

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

  it.each([
    { query: "", hasFavorites: true },
    { query: "   ", hasFavorites: true },
    { query: "", hasFavorites: false },
    { query: "other", hasFavorites: true },
  ])("lists favorites without searching only for a blank query with favorites: %j", async ({
    query,
    hasFavorites,
  }) => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
    });

    const zuluConfiguration = await AgentConfigurationFactory.createTestAgent(
      auth,
      { name: "Zulu Favorite" }
    );
    const alphaConfiguration = await AgentConfigurationFactory.createTestAgent(
      auth,
      { name: "Alpha Favorite" }
    );
    const zulu = await AgentResource.fetchById(auth, zuluConfiguration.sId);
    const alpha = await AgentResource.fetchById(auth, alphaConfiguration.sId);
    assert(zulu && alpha);
    if (hasFavorites) {
      const zuluResult = await zulu.setUserFavorite(auth, true);
      const alphaResult = await alpha.setUserFavorite(auth, true);
      expect(zuluResult.isOk() && alphaResult.isOk()).toBe(true);
    }

    const params = new URLSearchParams({ query, select: "agents" });
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/assistant/mentions/suggestions?${params}`
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    if (!query.trim() && hasFavorites) {
      expect(
        body.suggestions.map((suggestion: { id: string }) => suggestion.id)
      ).toEqual([alpha.sId, zulu.sId]);
      expect(mockSearch).not.toHaveBeenCalled();
    } else {
      expect(body.suggestions).toEqual([]);
      expect(mockSearch).toHaveBeenCalledOnce();
    }
  });
});
