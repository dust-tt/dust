import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSearch = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/elasticsearch", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/elasticsearch")>();
  return {
    ...actual,
    withEs: async (
      fn: (client: { search: typeof mockSearch }) => Promise<unknown>
    ) => {
      const { Ok } = await import("@app/types/shared/result");
      return new Ok(await fn({ search: mockSearch }));
    },
  };
});

import { searchSkills } from "@app/lib/api/skills/search";
import {
  buildSkillSearchQuery,
  MAX_SKILL_SEARCH_RESULTS,
} from "@app/lib/skill_search/query";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import type { SkillSearchFilters } from "@app/types/api/skills";
import assert from "assert";

describe("searchSkills pagination", () => {
  beforeEach(() => mockSearch.mockReset());

  it("defaults to the maximum page size and returns no cursor for empty results", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    mockSearch.mockResolvedValue({ hits: { hits: [] } });

    const result = await searchSkills(auth, { searchTerm: "" });
    assert(result.isOk());
    expect(result.value).toEqual({
      skills: [],
      hasMore: false,
      nextCursor: null,
    });
    expect(mockSearch).toHaveBeenCalledOnce();
    expect(mockSearch.mock.calls[0][0].size).toBe(MAX_SKILL_SEARCH_RESULTS + 1);
    expect(mockSearch.mock.calls[0][0]).not.toHaveProperty("search_after");
  });

  it("passes the last consumed ES sort tuple back unchanged on the next page", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    const skill = await SkillFactory.create(auth, { name: "ÉclairBot" });
    const [document] = await SkillFactory.createSearchDocuments(auth, [skill]);
    const hits = [
      { _source: document, sort: [3.25, "eclairbot", skill.sId] },
      {
        _source: { ...document, skill_id: "second", name: "ReportBot" },
        sort: [2, "reportbot", "second"],
      },
      {
        _source: { ...document, skill_id: "third", name: "WeatherBot" },
        sort: [1, "weatherbot", "third"],
      },
    ];
    mockSearch
      .mockResolvedValueOnce({ hits: { hits } })
      .mockResolvedValue({ hits: { hits: hits.slice(2) } });
    const filters: SkillSearchFilters = { editedByMe: true };
    const options = { searchTerm: "bot", limit: 2, filters };

    const first = await searchSkills(auth, options);
    assert(first.isOk());
    expect(first.value.skills.map((item) => item.sId)).toEqual([
      skill.sId,
      "second",
    ]);
    expect(first.value.nextCursor).toBe(
      Buffer.from(JSON.stringify(hits[1].sort)).toString("base64url")
    );
    expect(first.value.hasMore).toBe(true);

    const nextOptions = { ...options, cursor: first.value.nextCursor };
    const second = await searchSkills(auth, nextOptions);
    assert(second.isOk());
    expect(second.value.skills.map((item) => item.sId)).toEqual(["third"]);
    expect(second.value.nextCursor).toBe(
      Buffer.from(JSON.stringify(hits[2].sort)).toString("base64url")
    );
    expect(second.value.hasMore).toBe(false);
    expect(mockSearch).toHaveBeenCalledTimes(2);
    expect(mockSearch.mock.calls[1][0]).toMatchObject({
      size: 3,
      search_after: hits[1].sort,
      query: buildSkillSearchQuery(auth, options),
    });

    const retry = await searchSkills(auth, nextOptions);
    assert(retry.isOk());
    expect(retry.value).toEqual(second.value);
  });

  it.each([
    "invalid",
    "",
    Buffer.from("{}").toString("base64url"),
    Buffer.from("[{}]").toString("base64url"),
    Buffer.from("null").toString("base64url"),
  ])("rejects invalid cursor %s before querying Elasticsearch", async (cursor) => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });

    const result = await searchSkills(auth, { searchTerm: "", cursor });

    assert(result.isErr());
    expect(result.error).toBe("invalid_cursor");
    expect(mockSearch).not.toHaveBeenCalled();
  });
});
