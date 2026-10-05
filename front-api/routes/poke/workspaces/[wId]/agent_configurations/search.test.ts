import { AGENT_SEARCH_ALIAS_NAME } from "@app/lib/api/elasticsearch";
import { matchesAgentSearchFilters } from "@app/tests/utils/agent_search";
import { createPokeApiMockRequest } from "@app/tests/utils/generic_poke_api_tests";
import type { AgentSearchDocument } from "@app/types/agent_search/agent_search";
import type { estypes } from "@elastic/elasticsearch";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSearch = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/elasticsearch", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/elasticsearch")>();
  const { Ok } = await import("@app/types/shared/result");
  return {
    ...actual,
    withEs: async (
      fn: (client: { search: typeof mockSearch }) => Promise<unknown>
    ) => new Ok(await fn({ search: mockSearch })),
  };
});

function request(workspaceId: string, body: Record<string, unknown> = {}) {
  return honoApp.request(
    `/api/poke/workspaces/${workspaceId}/agent_configurations/search`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

function document(workspaceId: string, agentId: string): AgentSearchDocument {
  return {
    workspace_id: workspaceId,
    agent_id: agentId,
    status: "active",
    scope: "hidden",
    model: null,
    name: "Research",
    picture_url: "https://dust.tt/static/agent.png",
    last_edited_by_user_id: null,
    requested_space_ids: ["restricted-space"],
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    description: "Research assistant",
    skill_ids: [],
    mcp_server_view_ids: [],
    tag_ids: [],
    feedback_positive_count: 0,
    feedback_negative_count: 0,
    active_users_count: 3,
    favorite_count: 0,
    editor_ids: [],
  };
}

describe("Poke agent search", () => {
  beforeEach(() => {
    mockSearch.mockReset();
  });

  it("searches hidden agents in the inspected workspace without a provisioned user", async () => {
    const { workspace } = await createPokeApiMockRequest({ isSuperUser: true });
    const documents = [
      document(workspace.sId, "first"),
      document(workspace.sId, "second"),
      document("other-workspace", "other"),
    ];
    mockSearch.mockImplementation(async (query: estypes.SearchRequest) => {
      const matching = documents.filter((item) =>
        matchesAgentSearchFilters(item, query.query!)
      );
      const offset = query.from ?? 0;
      return {
        hits: {
          total: { value: matching.length, relation: "eq" },
          hits: matching
            .slice(offset, offset + (query.size ?? 100))
            .map((_source) => ({ _source })),
        },
        aggregations: { models: { buckets: [] } },
      };
    });

    const response = await request(workspace.sId, {
      query: "Research",
      scope: ["hidden"],
      limit: 1,
      offset: 1,
      sortBy: "name",
      sortOrder: "asc",
      facets: ["models"],
    });

    expect(
      response.status,
      response.status === 200 ? "" : await response.text()
    ).toBe(200);
    expect(await response.json()).toMatchObject({
      agents: [{ sId: "second", scope: "hidden", name: "Research" }],
      total: 2,
      hasMore: false,
      facets: { models: [] },
    });
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        index: AGENT_SEARCH_ALIAS_NAME,
        from: 1,
        size: 1,
        sort: [
          { "name.keyword": { order: "asc", missing: "_last" } },
          { agent_id: { order: "asc" } },
        ],
        aggs: expect.objectContaining({ models: expect.anything() }),
      })
    );
  });

  it("rejects requests without Poke authentication", async () => {
    const { workspace } = await createPokeApiMockRequest();
    expect((await request(workspace.sId)).status).toBe(401);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("rejects invalid queries and offsets outside the ES window before searching", async () => {
    const { workspace } = await createPokeApiMockRequest({ isSuperUser: true });
    expect((await request(workspace.sId, { limit: 101 })).status).toBe(400);
    expect(
      (await request(workspace.sId, { offset: 10000, limit: 1 })).status
    ).toBe(400);
    expect(mockSearch).not.toHaveBeenCalled();
  });
});
