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
  MAX_SKILL_SEARCH_WINDOW,
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
  beforeEach(() => {
    mockSearch.mockReset();
  });

  it("defaults to the first page of maximum size and returns an empty total for empty results", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    mockSearch.mockResolvedValue({
      hits: { hits: [], total: { value: 0, relation: "eq" } },
    });

    const result = await searchSkills(auth, { searchTerm: "" });
    assert(result.isOk());
    expect(result.value).toEqual({
      skills: [],
      total: 0,
      hasMore: false,
      facets: {},
    });
    expect(mockSearch).toHaveBeenCalledOnce();
    expect(mockSearch.mock.calls[0][0]).toMatchObject({
      from: 0,
      size: MAX_SKILL_SEARCH_RESULTS,
      track_total_hits: true,
    });
    expect(mockSearch.mock.calls[0][0]).not.toHaveProperty("search_after");
  });

  it("requests from/size/track_total_hits and returns total/hasMore", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    const skill = await SkillFactory.create(auth, { name: "ÉclairBot" });
    const [document] = await SkillFactory.createSearchDocuments(auth, [skill]);
    const hits = [
      { _source: document },
      { _source: { ...document, skill_id: "second", name: "ReportBot" } },
      { _source: { ...document, skill_id: "third", name: "AlphaBot" } },
    ];
    mockSearch.mockImplementation(async (request: estypes.SearchRequest) => ({
      hits: {
        hits: hits.slice(
          request.from ?? 0,
          (request.from ?? 0) + (request.size ?? hits.length)
        ),
        total: { value: hits.length, relation: "eq" },
      },
    }));
    const filters: SkillSearchFilters = { editedByMe: true };
    const options = { searchTerm: "bot", limit: 2, filters };

    const first = await searchSkills(auth, options);
    assert(first.isOk());
    expect(first.value.skills.map((item) => item.sId)).toEqual([
      skill.sId,
      "second",
    ]);
    expect(first.value.total).toBe(3);
    expect(first.value.hasMore).toBe(true);

    const nextOptions = { ...options, offset: 2 };
    const second = await searchSkills(auth, nextOptions);
    assert(second.isOk());
    expect(second.value.skills.map((item) => item.sId)).toEqual(["third"]);
    expect(second.value.total).toBe(3);
    expect(second.value.hasMore).toBe(false);
    expect(mockSearch).toHaveBeenCalledTimes(2);
    const codeDefinedSkillIds =
      await SkillResource.listAvailableCodeDefinedIds(auth);
    expect(mockSearch.mock.calls[1][0]).toMatchObject({
      from: 2,
      size: 2,
      track_total_hits: true,
      sort: [
        { _score: { order: "desc" } },
        { active_users_count: { order: "desc", missing: "_last" } },
        { skill_id: { order: "asc" } },
      ],
      query: buildSkillSearchQuery(auth, { ...options, codeDefinedSkillIds }),
    });
    expect(mockSearch.mock.calls[1][0]).not.toHaveProperty("search_after");

    const retry = await searchSkills(auth, nextOptions);
    assert(retry.isOk());
    expect(retry.value).toEqual(second.value);
  });

  it("accepts a numeric hits.total", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    mockSearch.mockResolvedValue({ hits: { hits: [], total: 7 } });

    const result = await searchSkills(auth, { searchTerm: "", offset: 5 });
    assert(result.isOk());
    expect(result.value).toEqual({
      skills: [],
      total: 7,
      hasMore: true,
      facets: {},
    });
  });

  it.each([
    { offset: MAX_SKILL_SEARCH_WINDOW, limit: 1 },
    { offset: MAX_SKILL_SEARCH_WINDOW - 1, limit: 2 },
    { offset: MAX_SKILL_SEARCH_WINDOW - MAX_SKILL_SEARCH_RESULTS + 1 },
  ])("rejects out-of-range pagination %j before querying Elasticsearch", async (pagination) => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });

    const result = await searchSkills(auth, { searchTerm: "", ...pagination });

    assert(result.isErr());
    expect(result.error).toBe("offset_out_of_range");
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("accepts a page ending exactly at the result window", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    mockSearch.mockResolvedValue({
      hits: { hits: [], total: { value: 0, relation: "eq" } },
    });

    const result = await searchSkills(auth, {
      searchTerm: "",
      offset: MAX_SKILL_SEARCH_WINDOW - 10,
      limit: 10,
    });

    assert(result.isOk());
    expect(mockSearch.mock.calls[0][0]).toMatchObject({
      from: MAX_SKILL_SEARCH_WINDOW - 10,
      size: 10,
    });
  });
});

describe("searchSkills filters and facets", () => {
  beforeEach(() => {
    mockSearch.mockReset();
  });

  it("sends the editor, child skill, space and usage filters", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    mockSearch.mockResolvedValue({ hits: { hits: [] } });

    await searchSkills(auth, {
      searchTerm: "",
      filters: {
        editorIds: ["alice"],
        childSkillIds: ["child"],
        spaceIds: ["space"],
        activeUsersCount: { min: 3 },
      },
    });

    const { filter } = mockSearch.mock.calls[0][0].query.bool;
    expect(filter).toEqual(
      expect.arrayContaining([
        { terms: { editor_ids: ["alice"] } },
        { terms: { child_skill_ids: ["child"] } },
        { terms: { requested_space_ids: ["space"] } },
        { range: { active_users_count: { gte: 3, lte: undefined } } },
      ])
    );
  });

  it("returns facet values with counts and the usage range", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    mockSearch.mockResolvedValue({
      hits: { total: { value: 3, relation: "eq" }, hits: [] },
      aggregations: {
        availability: { buckets: [{ key: "workspace_users", doc_count: 3 }] },
        editors: { buckets: [{ key: "alice", doc_count: 2 }] },
        usage: { count: 3, min: 0, max: 17 },
      },
    });

    const result = await searchSkills(auth, {
      searchTerm: "",
      limit: 0,
      facets: ["availability", "editors", "usage"],
    });
    assert(result.isOk());
    expect(result.value.facets).toEqual({
      availability: [{ value: "workspace_users", count: 3 }],
      editors: [{ value: "alice", count: 2 }],
      usage: { min: 0, max: 17 },
    });
    expect(mockSearch.mock.calls[0][0]).toMatchObject({
      size: 0,
      aggs: {
        availability: { terms: { field: "availability" } },
        editors: { terms: { field: "editor_ids" } },
        usage: { stats: { field: "active_users_count" } },
      },
    });
  });
});

describe("code-defined skill search", () => {
  beforeEach(() => {
    const documents = SkillFactory.createCodeDefinedSearchDocuments();
    mockSearch.mockReset();
    mockSearch.mockImplementation(async (request: estypes.SearchRequest) => {
      const matching = documents.filter((document) =>
        matchesSkillSearchFilters(document, request.query!)
      );
      return {
        hits: {
          hits: matching.map((document) => ({ _source: document })),
          total: { value: matching.length, relation: "eq" },
        },
      };
    });
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
      total: 0,
      hasMore: false,
      facets: {},
    });
  });

  it("filters indexed tool IDs without loading code-defined tools", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const view =
      await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
        auth,
        "web_search_&_browse"
      );
    assert(view);
    const skill = await SkillFactory.create(auth, {
      mcpServerViews: [view],
    });
    const customDocuments = await SkillFactory.createSearchDocuments(auth, [
      skill,
    ]);
    const documents = [
      ...customDocuments,
      ...SkillFactory.createCodeDefinedSearchDocuments(),
    ];
    mockSearch.mockImplementation(async (request: estypes.SearchRequest) => {
      const matching = documents.filter((document) =>
        matchesSkillSearchFilters(document, request.query!)
      );
      return {
        hits: {
          hits: matching.map((document) => ({ _source: document })),
          total: { value: matching.length, relation: "eq" },
        },
      };
    });
    const options = {
      searchTerm: "",
      filters: { mcpServerViewIds: [view.sId] },
    };
    const listViews = vi.spyOn(MCPServerViewResource, "listByMCPServers");
    try {
      const result = await searchSkills(auth, options);
      assert(result.isOk());
      expect(result.value.skills.map((item) => item.sId)).toEqual([skill.sId]);
      expect(listViews).not.toHaveBeenCalled();
    } finally {
      listViews.mockRestore();
    }

    const { authenticator: otherAuth } = await createResourceTest({
      role: "admin",
    });
    const denied = await searchSkills(otherAuth, options);
    assert(denied.isOk());
    expect(denied.value.skills).toEqual([]);
  });

  it("uses the same autocomplete and offset pagination for a mixed ES page", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    const skill = await SkillFactory.create(auth, { name: "WeeklyDeepReport" });
    const [custom] = await SkillFactory.createSearchDocuments(auth, [skill]);
    const documents = SkillFactory.createCodeDefinedSearchDocuments();
    const global = documents.find(
      (document) => document.skill_id === "go-deep"
    );
    assert(global);
    const hits = [
      { _source: custom },
      { _source: global },
      { _source: { ...custom, skill_id: "last", name: "Deep" } },
    ];
    mockSearch.mockImplementation(async (request: estypes.SearchRequest) => ({
      hits: {
        hits: hits.slice(
          request.from ?? 0,
          (request.from ?? 0) + (request.size ?? hits.length)
        ),
        total: { value: hits.length, relation: "eq" },
      },
    }));

    const page = await searchSkills(auth, { searchTerm: "deep", limit: 2 });
    assert(page.isOk());
    expect(page.value.skills.map((item) => item.sId)).toEqual([
      skill.sId,
      global.skill_id,
    ]);
    expect(page.value.total).toBe(3);
    expect(page.value.hasMore).toBe(true);
    expect(page.value.skills[1]).not.toHaveProperty("score");
    expect(mockSearch.mock.calls[0][0].query.bool.must).toEqual([
      buildSkillNameAutocompleteQuery("deep"),
    ]);

    const next = await searchSkills(auth, {
      searchTerm: "deep",
      limit: 2,
      offset: 2,
    });
    assert(next.isOk());
    expect(next.value.skills.map((item) => item.sId)).toEqual(["last"]);
    expect(next.value.total).toBe(3);
    expect(next.value.hasMore).toBe(false);
    expect(mockSearch.mock.calls[1][0]).toMatchObject({ from: 2, size: 2 });
    expect(mockSearch.mock.calls[1][0].query).toEqual(
      mockSearch.mock.calls[0][0].query
    );
  });
});
