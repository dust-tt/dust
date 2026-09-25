import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  MAX_SKILL_SEARCH_RESULTS,
  MAX_SKILL_SEARCH_WINDOW,
} from "@app/lib/skill_search/query";
import { toSkillListItem } from "@app/lib/skill_search/serialization";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { matchesSkillSearchFilters } from "@app/tests/utils/skill_search";
import { SkillListItemSchema } from "@app/types/assistant/skill_configuration";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
import type { estypes } from "@elastic/elasticsearch";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSearch = vi.hoisted(() => vi.fn());

// Exercise the HTTP route and hydrated caller grants with real database fixtures.
// The ES mock applies the generated filters to indexed metadata.
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

function mockIndexedHits(hits: { _source: SkillSearchDocument }[]) {
  mockSearch.mockImplementation(async (request: estypes.SearchRequest) => {
    const matching = hits.filter((hit) =>
      matchesSkillSearchFilters(hit._source, request.query!)
    );
    const from = request.from ?? 0;
    return {
      hits: {
        total: { value: matching.length, relation: "eq" },
        hits: matching.slice(from, from + (request.size ?? matching.length)),
      },
    };
  });
}

function searchRequest(
  workspaceId: string,
  body: Record<string, unknown> = {}
) {
  return honoApp.request(`/api/w/${workspaceId}/skills/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/skills/search redaction integration", () => {
  beforeEach(() => {
    mockSearch.mockReset();
  });

  it.each([
    { role: "user", grant: "none", expected: false },
    { role: "user", grant: "editor", expected: true },
    { role: "manager", grant: "none", expected: false },
    { role: "manager", grant: "editor", expected: true },
    { role: "admin", grant: "none", expected: true },
    { role: "user", grant: "*", expected: true },
  ] as const)("returns administration permissions for $role with $grant grants", async ({
    role,
    grant,
    expected,
  }) => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      role,
    });
    await FeatureFlagFactory.basic(auth, "skills_search");
    const skill = await SkillFactory.create(auth, {
      availability: "workspace_users",
      addCurrentUserAsEditor: grant === "editor",
    });
    if (grant === "*") {
      await grantWorkspacePermission(workspace, user, {
        grantType: "*",
        resourceType: "skill",
      });
      await auth.refresh();
    }
    const [document] = await SkillFactory.createSearchDocuments(auth, [skill]);
    // Indexed editors may be stale; administration must use the current caller's grants.
    document.editor_ids = expected ? [] : [user.sId];
    const global = SkillFactory.createCodeDefinedSearchDocuments().find(
      (document) => document.skill_id === "go-deep"
    );
    assert(global);
    mockSearch.mockResolvedValue({
      hits: {
        total: { value: 2, relation: "eq" },
        hits: [{ _source: document }, { _source: global }],
      },
    });

    const response = await searchRequest(workspace.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).skills).toEqual([
      expect.objectContaining({ sId: skill.sId, canAdministrate: expected }),
      expect.objectContaining({ sId: global.skill_id, canAdministrate: false }),
    ]);
  });

  it.each([
    "usage",
    "relevance",
  ] as const)("sorts by %s and keeps the sort on every offset page", async (sortBy) => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "skills_search");
    const skill = await SkillFactory.create(auth);
    const [document] = await SkillFactory.createSearchDocuments(auth, [skill]);
    mockSearch.mockResolvedValue({
      hits: {
        total: { value: 2, relation: "eq" },
        hits: [{ _source: document }],
      },
    });

    const first = await searchRequest(workspace.sId, { sortBy, limit: 1 });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ total: 2, hasMore: true });
    const second = await searchRequest(workspace.sId, {
      sortBy,
      limit: 1,
      offset: 1,
    });
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ total: 2, hasMore: false });
    expect(mockSearch.mock.calls[1][0]).not.toHaveProperty("search_after");
    expect(mockSearch.mock.calls[1][0]).toMatchObject({
      from: 1,
      size: 1,
      track_total_hits: true,
      sort: [
        ...(sortBy === "relevance" ? [{ _score: { order: "desc" } }] : []),
        { active_users_count: { order: "desc", missing: "_last" } },
        { skill_id: { order: "asc" } },
      ],
    });
  });

  it.each([
    { sortBy: "name", field: "name.keyword" },
    { sortBy: "usage", field: "active_users_count" },
    { sortBy: "updatedAt", field: "updated_at" },
  ] as const)("sorts by $sortBy in both directions and preserves pagination", async ({
    sortBy,
    field,
  }) => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "skills_search");
    const skill = await SkillFactory.create(auth);
    const [document] = await SkillFactory.createSearchDocuments(auth, [skill]);
    mockSearch.mockResolvedValue({
      hits: {
        total: { value: 2, relation: "eq" },
        hits: [{ _source: document }],
      },
    });

    for (const sortOrder of ["asc", "desc"] as const) {
      const first = await searchRequest(workspace.sId, {
        sortBy,
        sortOrder,
        limit: 1,
      });
      expect(first.status).toBe(200);
      expect(mockSearch.mock.lastCall?.[0]).toMatchObject({ from: 0, size: 1 });

      const second = await searchRequest(workspace.sId, {
        sortBy,
        sortOrder,
        limit: 1,
        offset: 1,
      });
      expect(second.status).toBe(200);
      expect(mockSearch.mock.lastCall?.[0]).toMatchObject({
        from: 1,
        size: 1,
        sort: [
          {
            [field]: {
              order: sortOrder,
              missing: "_last",
              ...(sortBy === "updatedAt" ? { format: "epoch_millis" } : {}),
            },
          },
          { skill_id: { order: "asc" } },
        ],
      });
    }
  });

  it("returns the requested offset page with the exact total", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "skills_search");
    const skill = await SkillFactory.create(auth, { name: "RésuméBot" });
    const [document] = await SkillFactory.createSearchDocuments(auth, [skill]);
    mockIndexedHits([
      { _source: document },
      { _source: { ...document, skill_id: "next-skill" } },
    ]);

    const first = await searchRequest(workspace.sId, { limit: 1 });
    expect(first.status).toBe(200);
    const firstPage = await first.json();
    expect(firstPage.skills.map(({ sId }: { sId: string }) => sId)).toEqual([
      skill.sId,
    ]);
    expect(firstPage).toMatchObject({ total: 2, hasMore: true });

    const second = await searchRequest(workspace.sId, {
      limit: 1,
      offset: 1,
    });
    expect(second.status).toBe(200);
    const secondPage = await second.json();
    expect(secondPage.skills.map(({ sId }: { sId: string }) => sId)).toEqual([
      "next-skill",
    ]);
    expect(secondPage).toMatchObject({ total: 2, hasMore: false });
    expect(mockSearch.mock.calls[1][0]).toMatchObject({
      from: 1,
      size: 1,
      track_total_hits: true,
    });
  });

  it.each([
    { offset: MAX_SKILL_SEARCH_WINDOW - MAX_SKILL_SEARCH_RESULTS + 1 },
    { offset: MAX_SKILL_SEARCH_WINDOW - 1, limit: 2 },
    { offset: MAX_SKILL_SEARCH_WINDOW },
  ])("returns 400 for out-of-range pagination %s without querying Elasticsearch", async (pagination) => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "skills_search");

    const response = await searchRequest(workspace.sId, pagination);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        type: "invalid_request_error",
        message: "Skill search offset is out of range",
      },
    });
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it.each(
    (
      [
        { spaceKind: "space", availability: "workspace_users" },
        { spaceKind: "space", availability: "editors" },
        { spaceKind: "pod", availability: "workspace_users" },
        { spaceKind: "pod", availability: "editors" },
      ] as const
    ).flatMap((access) =>
      (["active", "archived"] as const).map((status) => ({ ...access, status }))
    )
  )("keeps only safe admin metadata for an unreadable $spaceKind / $availability / $status skill", async ({
    spaceKind,
    availability,
    status,
  }) => {
    const other = await createPrivateApiMockRequest({ role: "admin" });
    const foreign = await SkillFactory.create(other.auth, {
      name: "RedactionTest foreign",
      status,
    });
    const [foreignDocument] = await SkillFactory.createSearchDocuments(
      other.auth,
      [foreign]
    );
    assert(foreignDocument);

    // Set the HTTP session to this workspace after creating the foreign fixture.
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      role: "admin",
    });
    await FeatureFlagFactory.basic(auth, "skills_search");
    const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
    const restricted =
      spaceKind === "pod"
        ? await SpaceFactory.project(workspace)
        : await SpaceFactory.regular(workspace);
    const readableSkill = await SkillFactory.create(auth, {
      name: "RedactionTest readable",
      requestedSpaceIds: [globalSpace.id],
      availability,
      status,
    });
    const hiddenSkill = await SkillFactory.create(auth, {
      name: "RedactionTest hidden",
      availability,
      status,
      requestedSpaceIds: [restricted.id],
      instructions: "Private prompt must not leave the resource",
      instructionsHtml: "<p>Private prompt</p>",
    });
    const changedStatusSkill = await SkillFactory.create(auth, {
      name: "RedactionTest changed status",
      requestedSpaceIds: [globalSpace.id],
      status,
    });
    const documents = await SkillFactory.createSearchDocuments(auth, [
      readableSkill,
      hiddenSkill,
      changedStatusSkill,
    ]);
    if (status === "active") {
      await changedStatusSkill.archive(auth);
    } else {
      await changedStatusSkill.restore(auth);
    }
    const hits = [...documents, foreignDocument].map((document) => ({
      _source: {
        ...document,
        description: "Outdated indexed description",
        instructions: "Unexpected private ES field",
        mcp_server_view_ids: ["indexed-tool-view-id"],
        fileAttachments: ["Never expose indexed attachments"],
      },
    }));
    mockIndexedHits(hits);
    const requestBody = { query: "RedactionTest", status: [status] };

    const strict = await searchRequest(workspace.sId, requestBody);
    expect(strict.status).toBe(200);
    const strictBody = await strict.json();
    expect(strictBody.skills).toEqual([
      expect.objectContaining({ sId: readableSkill.sId }),
      expect.objectContaining({ sId: changedStatusSkill.sId, status }),
    ]);

    const redacted = await searchRequest(workspace.sId, {
      ...requestBody,
      permissionFiltering: "redact_unreadable",
    });
    expect(redacted.status).toBe(200);
    const body = await redacted.json();
    expect(body).toEqual({
      skills: hits.slice(0, 3).map(({ _source }) => ({
        ...toSkillListItem(auth, _source),
        editors: [
          {
            sId: user.sId,
            fullName: user.toJSON().fullName,
            image: user.toJSON().image,
          },
        ],
      })),
      total: 3,
      hasMore: false,
      facets: {},
    });
    for (const hit of body.skills) {
      expect(SkillListItemSchema.strict().parse(hit)).toEqual(hit);
      expect(hit).not.toHaveProperty("instructions");
      expect(hit).not.toHaveProperty("instructionsHtml");
      expect(hit).not.toHaveProperty("tools");
      expect(hit).not.toHaveProperty("fileAttachments");
      expect(hit).not.toHaveProperty("editor_ids");
      expect(hit).not.toHaveProperty("editor_group_ids");
      expect(hit).not.toHaveProperty("mcp_server_view_ids");
    }

    const [updated] = await SkillFactory.createSearchDocuments(auth, [
      changedStatusSkill,
    ]);
    hits[2]._source.status = updated.status;
    const afterIndexation = await searchRequest(workspace.sId, requestBody);
    expect(afterIndexation.status).toBe(200);
    expect((await afterIndexation.json()).skills).toEqual([
      expect.objectContaining({ sId: readableSkill.sId }),
    ]);

    const request: estypes.SearchRequest = mockSearch.mock.calls[1][0];
    const customQuery = {
      bool: {
        filter: [{ term: { workspace_id: workspace.sId } }],
      },
    };
    expect(request.query).toEqual({
      bool: {
        filter: [{ terms: { status: [status] } }],
        must: expect.any(Array),
        should: [
          customQuery,
          expect.objectContaining({
            bool: expect.objectContaining({
              filter: expect.arrayContaining([
                { term: { workspace_id: "global" } },
              ]),
            }),
          }),
        ],
        minimum_should_match: 1,
      },
    });
  });

  it("filters restricted, removed and foreign skills in the ES query", async () => {
    const other = await createPrivateApiMockRequest({ role: "admin" });
    const foreign = await SkillFactory.create(other.auth, { name: "Foreign" });
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "skills_search");
    const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
    const custom = await SkillFactory.create(auth, {
      name: "Custom",
      requestedSpaceIds: [globalSpace.id],
      availability: "workspace_users",
    });
    const [customDocument] = await SkillFactory.createSearchDocuments(auth, [
      custom,
    ]);
    const [foreignDocument] = await SkillFactory.createSearchDocuments(
      other.auth,
      [foreign]
    );
    const documents = SkillFactory.createCodeDefinedSearchDocuments();
    const global = documents.find(
      (document) => document.skill_id === "go-deep"
    );
    assert(global);
    mockIndexedHits([
      { _source: { ...global, skill_id: "workspace-analytics" } },
      { _source: { ...global, skill_id: "removed-code-defined-skill" } },
      { _source: foreignDocument },
      { _source: { ...global, name: "Indexed Go Deep" } },
      { _source: customDocument },
    ]);
    const response = await searchRequest(workspace.sId);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.skills).toEqual([
      expect.objectContaining({
        sId: "go-deep",
        name: "Indexed Go Deep",
      }),
      expect.objectContaining({ sId: custom.sId }),
    ]);
    expect(body.total).toBe(2);
    expect(body.hasMore).toBe(false);
    expect(mockSearch).toHaveBeenCalledOnce();
  });

  it("does not inject code-defined skills absent from Elasticsearch", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "skills_search");
    mockSearch.mockResolvedValue({
      hits: { total: { value: 0, relation: "eq" }, hits: [] },
    });
    const response = await searchRequest(workspace.sId, { query: "deep" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      skills: [],
      total: 0,
      hasMore: false,
      facets: {},
    });
  });
});
