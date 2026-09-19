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
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import {
  buildSkillSearchQuery,
  MAX_SKILL_SEARCH_RESULTS,
} from "@app/lib/skill_search/query";
import { buildSkillNameAutocompleteQuery } from "@app/lib/skill_search/ranking";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { matchesSkillSearchFilters } from "@app/tests/utils/skill_search";
import type { SkillSearchFilters } from "@app/types/api/skills";
import type { estypes } from "@elastic/elasticsearch";
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
      { _source: document, sort: [3.25, skill.sId] },
      {
        _source: { ...document, skill_id: "second", name: "ReportBot" },
        sort: [2, "second"],
      },
      {
        _source: { ...document, skill_id: "third", name: "AlphaBot" },
        sort: [2, "third"],
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
    const codeDefinedSkillIds =
      await SkillResource.listAvailableCodeDefinedIds(auth);
    expect(mockSearch.mock.calls[1][0]).toMatchObject({
      size: 3,
      sort: [{ _score: { order: "desc" } }, { skill_id: { order: "asc" } }],
      search_after: hits[1].sort,
      query: buildSkillSearchQuery(auth, { ...options, codeDefinedSkillIds }),
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

describe("code-defined skill search", () => {
  beforeEach(async () => {
    const documents = await SkillFactory.createCodeDefinedSearchDocuments();
    mockSearch.mockReset();
    mockSearch.mockImplementation(async (request: estypes.SearchRequest) => ({
      hits: {
        hits: documents
          .filter((document) =>
            matchesSkillSearchFilters(document, request.query!)
          )
          .map((document) => ({
            _source: document,
            sort: [1, document.name.toLowerCase(), document.skill_id],
          })),
      },
    }));
  });

  it("applies registry restrictions and availability filters", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    const result = await searchSkills(auth, {
      searchTerm: "",
      filters: { availability: ["users_and_agents"] },
    });
    assert(result.isOk());
    const globals = await GlobalSkillsRegistry.findAll(auth);
    const ids = result.value.skills.map((skill) => skill.sId).sort();
    expect(ids).toEqual(globals.map((skill) => skill.sId).sort());
    expect(ids).toContain("go-deep");
    expect(ids).not.toContain("workspace-analytics");
  });

  it("uses the resource's available IDs in the global ES filter", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    const expectedIds = await SkillResource.listAvailableCodeDefinedIds(auth);

    const result = await searchSkills(auth, { searchTerm: "" });

    assert(result.isOk());
    expect(result.value.skills.map((skill) => skill.sId).sort()).toEqual(
      [...expectedIds].sort()
    );
    expect(
      mockSearch.mock.lastCall![0].query.bool.should[1].bool.filter
    ).toContainEqual({
      terms: { skill_id: expectedIds },
    });
  });

  it("applies the current user's memory preference before querying ES", async () => {
    const { authenticator: auth, user } = await createResourceTest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "user_memory");
    await user.setMemoryEnabled(auth, true);

    const enabled = await searchSkills(auth, { searchTerm: "" });
    assert(enabled.isOk());
    expect(enabled.value.skills.map((skill) => skill.sId)).toContain(
      "user_memory"
    );

    await user.setMemoryEnabled(auth, false);

    const disabled = await searchSkills(auth, { searchTerm: "" });
    assert(disabled.isOk());
    expect(disabled.value.skills.map((skill) => skill.sId)).not.toContain(
      "user_memory"
    );
  });

  it.each<SkillSearchFilters>([
    { status: ["archived"] },
    { editedByMe: true },
    { availability: ["editors"] },
  ])("excludes code-defined skills for %j", async (filters) => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    const result = await searchSkills(auth, { searchTerm: "", filters });
    assert(result.isOk());
    expect(result.value).toEqual({
      skills: [],
      hasMore: false,
      nextCursor: null,
    });
  });

  it("resolves tool filters using the caller's workspace views", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const view =
      await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
        auth,
        "web_search_&_browse"
      );
    assert(view);
    const options = {
      searchTerm: "",
      filters: { mcpServerViewIds: [view.sId] },
    };
    const result = await searchSkills(auth, options);
    assert(result.isOk());
    const ids = result.value.skills.map((skill) => skill.sId);
    expect(ids).toContain("go-deep");
    expect(ids).not.toContain("discover_skills");

    const { authenticator: otherAuth } = await createResourceTest({
      role: "admin",
    });
    const denied = await searchSkills(otherAuth, options);
    assert(denied.isOk());
    expect(denied.value.skills).toEqual([]);
  });

  it("uses the same autocomplete and cursor for a mixed ES page", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    const skill = await SkillFactory.create(auth, { name: "WeeklyDeepReport" });
    const [custom] = await SkillFactory.createSearchDocuments(auth, [skill]);
    const documents = await SkillFactory.createCodeDefinedSearchDocuments();
    const global = documents.find(
      (document) => document.skill_id === "go-deep"
    );
    assert(global);
    const hits = [
      { _source: custom, sort: [3.25, "weeklydeepreport", skill.sId] },
      { _source: global, sort: [2, "go deep", global.skill_id] },
      {
        _source: { ...custom, skill_id: "last", name: "Deep" },
        sort: [1.5, "deep", "last"],
      },
    ];
    mockSearch
      .mockResolvedValueOnce({ hits: { hits } })
      .mockResolvedValueOnce({ hits: { hits: hits.slice(2) } });

    const page = await searchSkills(auth, { searchTerm: "deep", limit: 2 });
    assert(page.isOk());
    expect(page.value.skills.map((item) => item.sId)).toEqual([
      skill.sId,
      global.skill_id,
    ]);
    expect(page.value.nextCursor).toBe(
      Buffer.from(JSON.stringify(hits[1].sort)).toString("base64url")
    );
    expect(page.value.hasMore).toBe(true);
    expect(page.value.skills[1]).not.toHaveProperty("score");
    for (const branch of mockSearch.mock.calls[0][0].query.bool.should) {
      expect(branch.bool.must).toEqual([
        buildSkillNameAutocompleteQuery("deep"),
      ]);
    }

    const next = await searchSkills(auth, {
      searchTerm: "deep",
      limit: 2,
      cursor: page.value.nextCursor,
    });
    assert(next.isOk());
    expect(next.value.skills.map((item) => item.sId)).toEqual(["last"]);
    expect(next.value.nextCursor).toBe(
      Buffer.from(JSON.stringify(hits[2].sort)).toString("base64url")
    );
    expect(next.value.hasMore).toBe(false);
    expect(mockSearch.mock.calls[1][0].search_after).toEqual(hits[1].sort);
  });
});
