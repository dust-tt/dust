import { SKILL_SEARCH_ALIAS_NAME } from "@app/lib/api/elasticsearch";
import { createPokeApiMockRequest } from "@app/tests/utils/generic_poke_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { matchesSkillSearchFilters } from "@app/tests/utils/skill_search";
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
  return honoApp.request(`/api/poke/workspaces/${workspaceId}/skills/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Poke skill search", () => {
  beforeEach(() => {
    mockSearch.mockReset();
  });

  it("searches editor-only skills with the manage query, without a user or feature flag", async () => {
    const { workspace, auth } = await createPokeApiMockRequest({
      isSuperUser: true,
    });
    const skill = await SkillFactory.create(auth, {
      availability: "editors",
    });
    const [document] = await SkillFactory.createSearchDocuments(auth, [skill]);
    const documents = [
      document,
      { ...document, workspace_id: "other-workspace" },
    ];
    mockSearch.mockImplementation(async (query: estypes.SearchRequest) => {
      const matching = documents.filter((item) =>
        matchesSkillSearchFilters(item, query.query!)
      );
      return {
        hits: {
          total: { value: matching.length, relation: "eq" },
          hits: matching
            .slice(query.from ?? 0, (query.from ?? 0) + (query.size ?? 100))
            .map((_source) => ({ _source })),
        },
        aggregations: {
          availability: { buckets: [{ key: "editors", doc_count: 1 }] },
        },
      };
    });

    const response = await request(workspace.sId, {
      availability: ["editors"],
      limit: 1,
      sortBy: "usage",
      facets: ["availability"],
    });
    expect(
      response.status,
      response.status === 200 ? "" : await response.text()
    ).toBe(200);
    expect(await response.json()).toMatchObject({
      skills: [{ sId: skill.sId, name: skill.name, availability: "editors" }],
      total: 1,
      hasMore: false,
      facets: { availability: [{ availability: "editors", count: 1 }] },
    });
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        index: SKILL_SEARCH_ALIAS_NAME,
        from: 0,
        size: 1,
        sort: [
          { active_users_count: { order: "desc", missing: "_last" } },
          { skill_id: { order: "asc" } },
        ],
      })
    );
    const editedByMe = await request(workspace.sId, { editedByMe: true });
    expect(editedByMe.status).toBe(200);
    expect(await editedByMe.json()).toMatchObject({ skills: [], total: 0 });
  });

  it("rejects requests without Poke authentication", async () => {
    const { workspace } = await createPokeApiMockRequest();
    expect((await request(workspace.sId)).status).toBe(401);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("rejects invalid queries and offsets outside the ES window before searching", async () => {
    const { workspace } = await createPokeApiMockRequest({ isSuperUser: true });
    expect((await request(workspace.sId, { sortBy: "unknown" })).status).toBe(
      400
    );
    expect(
      (await request(workspace.sId, { offset: 10000, limit: 1 })).status
    ).toBe(400);
    expect(mockSearch).not.toHaveBeenCalled();
  });
});
