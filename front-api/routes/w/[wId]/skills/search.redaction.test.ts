import { SpaceResource } from "@app/lib/resources/space_resource";
import { toSkillListItem } from "@app/lib/skill_search/serialization";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { matchesSkillSearchFilters } from "@app/tests/utils/skill_search";
import { SkillListItemSchema } from "@app/types/assistant/skill_configuration";
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

  it("uses the encoded cursor from the last returned hit for the next page", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "skills_search");
    const skill = await SkillFactory.create(auth, { name: "RésuméBot" });
    const [document] = await SkillFactory.createSearchDocuments(auth, [skill]);
    const hits = [
      { _source: document, sort: [3.25, "résumébot", skill.sId, true, null] },
      {
        _source: { ...document, skill_id: "next-skill" },
        sort: [2, "résumébot", "next-skill"],
      },
    ];
    mockSearch
      .mockResolvedValueOnce({ hits: { hits } })
      .mockResolvedValueOnce({ hits: { hits: hits.slice(1) } });

    const first = await searchRequest(workspace.sId, { limit: 1 });
    expect(first.status).toBe(200);
    const firstPage = await first.json();
    expect(firstPage.skills.map(({ sId }: { sId: string }) => sId)).toEqual([
      skill.sId,
    ]);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toBe(
      Buffer.from(JSON.stringify(hits[0].sort)).toString("base64url")
    );

    const second = await searchRequest(workspace.sId, {
      limit: 1,
      cursor: firstPage.nextCursor,
    });
    expect(second.status).toBe(200);
    const secondPage = await second.json();
    expect(secondPage.skills.map(({ sId }: { sId: string }) => sId)).toEqual([
      "next-skill",
    ]);
    expect(secondPage.hasMore).toBe(false);
    expect(mockSearch.mock.calls[1][0].search_after).toEqual(hits[0].sort);
  });

  it.each([
    "invalid",
    Buffer.from("[{}]").toString("base64url"),
  ])("returns 400 for malformed cursor %s without querying Elasticsearch", async (cursor) => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "skills_search");

    const response = await searchRequest(workspace.sId, { cursor });

    expect(response.status).toBe(400);
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
    const { auth, workspace } = await createPrivateApiMockRequest({
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
      sort: [80, document.name, document.skill_id],
    }));
    mockSearch.mockImplementation(async (request: estypes.SearchRequest) => ({
      hits: {
        hits: hits.filter((hit) =>
          matchesSkillSearchFilters(hit._source, request.query!)
        ),
      },
    }));
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
      skills: hits.slice(0, 3).map(({ _source }) => toSkillListItem(_source)),
      hasMore: false,
      nextCursor: Buffer.from(JSON.stringify(hits[2].sort)).toString(
        "base64url"
      ),
    });
    for (const hit of body.skills) {
      expect(SkillListItemSchema.strict().parse(hit)).toEqual(hit);
      expect(hit).not.toHaveProperty("instructions");
      expect(hit).not.toHaveProperty("instructionsHtml");
      expect(hit).not.toHaveProperty("tools");
      expect(hit).not.toHaveProperty("fileAttachments");
      expect(hit).not.toHaveProperty("editors");
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
        filter: [
          { term: { workspace_id: workspace.sId } },
          { terms: { status: [status] } },
        ],
        must: expect.any(Array),
      },
    };
    expect(request.query).toEqual({
      bool: {
        should: [
          customQuery,
          expect.objectContaining({
            bool: expect.objectContaining({
              filter: expect.arrayContaining([
                { term: { workspace_id: "global" } },
                { terms: { status: [status] } },
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
    const hits = [
      {
        sort: [9, "workspace analytics", "workspace-analytics"],
        _source: { ...global, skill_id: "workspace-analytics" },
      },
      {
        sort: [8, "deleted", "removed-code-defined-skill"],
        _source: { ...global, skill_id: "removed-code-defined-skill" },
      },
      { sort: [7, "foreign", foreign.sId], _source: foreignDocument },
      {
        sort: [6, "go deep", "go-deep"],
        _source: { ...global, name: "Indexed Go Deep" },
      },
      { sort: [5, "custom", custom.sId], _source: customDocument },
    ];
    mockSearch.mockImplementation(async (request: estypes.SearchRequest) => ({
      hits: {
        hits: hits.filter((hit) =>
          matchesSkillSearchFilters(hit._source, request.query!)
        ),
      },
    }));
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
    expect(body.nextCursor).toBe(
      Buffer.from(JSON.stringify([5, "custom", custom.sId])).toString(
        "base64url"
      )
    );
    expect(body.hasMore).toBe(false);
    expect(mockSearch).toHaveBeenCalledOnce();
  });

  it("does not inject code-defined skills absent from Elasticsearch", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
    });
    await FeatureFlagFactory.basic(auth, "skills_search");
    mockSearch.mockResolvedValue({ hits: { hits: [] } });
    const response = await searchRequest(workspace.sId, { query: "deep" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      skills: [],
      hasMore: false,
      nextCursor: null,
    });
  });
});
