import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClientSearch = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/elasticsearch", async () => {
  const { Ok } = await import("@app/types/shared/result");

  return {
    SKILL_SEARCH_ALIAS_NAME: "front.skill_search",
    withEs: async (
      fn: (client: { search: typeof mockClientSearch }) => Promise<unknown>
    ) => new Ok(await fn({ search: mockClientSearch })),
  };
});

import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import { searchSkillDocuments } from "@app/lib/skill_search/search";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";

function makeSkillDocument(
  overrides: Partial<SkillSearchDocument> = {}
): SkillSearchDocument {
  return {
    workspace_id: "workspace",
    skill_id: "skill",
    status: "active",
    availability: "workspace_users",
    name: "Skill",
    user_facing_description: "Description",
    icon: null,
    edited_by: null,
    editor_user_ids: [],
    requested_space_ids: [],
    non_pod_space_ids: [],
    non_pod_space_count: 0,
    pod_space_id: null,
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function mockHits(documents: SkillSearchDocument[]) {
  mockClientSearch.mockResolvedValueOnce({
    hits: {
      hits: documents.map((document) => ({ _source: document })),
    },
  });
}

describe("skill_search/search", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockClientSearch.mockReset();
  });

  it("requires every skill non-pod space to match a readable user space", async () => {
    const { auth, workspace, user, globalSpace } =
      await createPrivateApiMockRequest({ role: "user" });
    mockHits([]);

    const result = await searchSkillDocuments(auth, {
      searchTerm: "summarize",
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    expect(mockClientSearch).toHaveBeenCalledOnce();
    const request = mockClientSearch.mock.calls[0][0];
    expect(request).toMatchObject({
      index: "front.skill_search",
      size: 50,
      sort: [
        { _score: { order: "desc" } },
        { "name.keyword": { order: "asc" } },
        { skill_id: { order: "asc" } },
      ],
    });
    expect(request.query.bool).toMatchObject({
      minimum_should_match: 1,
      should: [
        {
          multi_match: {
            query: "summarize",
            fields: ["name^4", "user_facing_description^2"],
            type: "bool_prefix",
          },
        },
        {
          wildcard: {
            "name.subsequence": {
              value: "*s*u*m*m*a*r*i*z*e*",
              case_insensitive: true,
              boost: 4,
            },
          },
        },
        {
          wildcard: {
            "user_facing_description.subsequence": {
              value: "*s*u*m*m*a*r*i*z*e*",
              case_insensitive: true,
              boost: 2,
            },
          },
        },
      ],
    });

    const filters = request.query.bool.filter;
    expect(filters).toEqual(
      expect.arrayContaining([
        { term: { workspace_id: workspace.sId } },
        { term: { status: "active" } },
      ])
    );
    expect(filters[2]).toEqual({
      bool: {
        should: [
          {
            terms: {
              availability: ["workspace_users", "users_and_agents"],
            },
          },
          {
            bool: {
              filter: [
                { term: { availability: "editors" } },
                { term: { editor_user_ids: user.id } },
              ],
            },
          },
        ],
        minimum_should_match: 1,
      },
    });
    expect(filters[3]).toMatchObject({
      bool: {
        minimum_should_match: 1,
        should: [
          { term: { non_pod_space_count: 0 } },
          {
            terms_set: {
              non_pod_space_ids: {
                minimum_should_match_field: "non_pod_space_count",
              },
            },
          },
        ],
      },
    });
    expect(
      filters[3].bool.should[1].terms_set.non_pod_space_ids.terms
    ).toContain(globalSpace.sId);
  });

  it("only accepts skills with no non-pod spaces when the user has none", async () => {
    const { auth } = await createPrivateApiMockRequest({ role: "user" });
    vi.spyOn(SpaceResource, "listWorkspaceSpaces").mockResolvedValue([]);
    mockHits([]);

    await searchSkillDocuments(auth, { searchTerm: "   ", limit: 10 });

    const request = mockClientSearch.mock.calls[0][0];
    expect(request.query.bool.filter[3]).toEqual({
      term: { non_pod_space_count: 0 },
    });
    expect(request.query.bool.should).toBeUndefined();
    expect(request.sort).toEqual([
      { "name.keyword": { order: "asc" } },
      { skill_id: { order: "asc" } },
    ]);
  });

  it("only allows published skills when a non-key authenticator has no user", async () => {
    const { auth } = await createPrivateApiMockRequest({ role: "user" });
    vi.spyOn(auth, "user").mockReturnValue(null);
    mockHits([]);

    await searchSkillDocuments(auth, { searchTerm: "skill", limit: 10 });

    const request = mockClientSearch.mock.calls[0][0];
    expect(request.query.bool.filter[2]).toEqual({
      bool: {
        should: [
          {
            terms: {
              availability: ["workspace_users", "users_and_agents"],
            },
          },
        ],
        minimum_should_match: 1,
      },
    });
  });

  it.each([
    ["sand", "*s*a*n*d*"],
    ["*", "*\\**"],
    ["?", "*\\?*"],
    ["\\", "*\\\\*"],
    ["a*b?c\\d", "*a*\\**b*\\?*c*\\\\*d*"],
    ["a.b", "*a*.*b*"],
  ])("builds a literal subsequence pattern for %s", async (query, pattern) => {
    const { auth } = await createPrivateApiMockRequest({ role: "user" });
    mockHits([]);

    await searchSkillDocuments(auth, { searchTerm: query, limit: 10 });

    const should = mockClientSearch.mock.calls[0][0].query.bool.should;
    expect(should[1].wildcard["name.subsequence"].value).toBe(pattern);
    expect(
      should[2].wildcard["user_facing_description.subsequence"].value
    ).toBe(pattern);
  });

  it("checks only candidate pod access after Elasticsearch", async () => {
    const { auth, workspace, user, globalGroup } =
      await createPrivateApiMockRequest({ role: "user" });
    const readablePod = await SpaceFactory.project(workspace, user.id);
    const openPod = await SpaceFactory.project(workspace);
    await SpaceFactory.attachGroup(openPod, globalGroup, "project_viewer");
    const unreadablePod = await SpaceFactory.project(workspace);
    await auth.refresh();
    const missingPodId = SpaceResource.modelIdToSId({
      id: 999_999_999,
      workspaceId: workspace.id,
    });

    const documents = [
      makeSkillDocument({
        skill_id: "unreadable-pod",
        pod_space_id: unreadablePod.sId,
      }),
      makeSkillDocument({ skill_id: "no-pod" }),
      makeSkillDocument({
        skill_id: "readable-pod",
        pod_space_id: readablePod.sId,
      }),
      makeSkillDocument({
        skill_id: "open-pod",
        pod_space_id: openPod.sId,
      }),
      makeSkillDocument({
        skill_id: "missing-pod",
        pod_space_id: missingPodId,
      }),
    ];
    const visibleDocuments = documents.filter((document) =>
      ["no-pod", "readable-pod", "open-pod"].includes(document.skill_id)
    );
    mockHits(documents);
    vi.spyOn(
      SkillSearchDocumentResource,
      "filterSearchDocumentsByCurrentState"
    ).mockImplementation(async (_auth, candidates) => [...candidates]);
    const fetchByIdsSpy = vi.spyOn(SpaceResource, "fetchByIds");

    const result = await searchSkillDocuments(auth, {
      searchTerm: "skill",
      limit: 2,
    });

    expect(fetchByIdsSpy).toHaveBeenCalledOnce();
    const [fetchAuth, fetchedPodIds] = fetchByIdsSpy.mock.calls[0];
    expect(fetchAuth).toBe(auth);
    expect(new Set(fetchedPodIds)).toEqual(
      new Set([readablePod.sId, openPod.sId, unreadablePod.sId, missingPodId])
    );
    expect(mockClientSearch).toHaveBeenCalledOnce();
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(
      SkillSearchDocumentResource.filterSearchDocumentsByCurrentState
    ).toHaveBeenCalledOnce();
    expect(
      SkillSearchDocumentResource.filterSearchDocumentsByCurrentState
    ).toHaveBeenCalledWith(auth, visibleDocuments);
    expect(result.value.map((document) => document.skill_id)).toEqual([
      "no-pod",
      "readable-pod",
    ]);
  });

  it("rejects an editors-only hit when the caller is not an editor", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
    });
    const editorsOnlySkill = makeSkillDocument({
      workspace_id: workspace.sId,
      skill_id: makeSId("skill", {
        id: 999_999_999,
        workspaceId: workspace.id,
      }),
      availability: "editors",
      editor_user_ids: [auth.getNonNullableUser().id],
    });
    mockHits([editorsOnlySkill]);
    const currentStateSpy = vi
      .spyOn(SkillSearchDocumentResource, "filterSearchDocumentsByCurrentState")
      .mockImplementation(async (_auth, candidates) => [...candidates]);

    const result = await searchSkillDocuments(auth, {
      searchTerm: "skill",
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([]);
    }
    expect(currentStateSpy).toHaveBeenCalledWith(auth, []);
  });

  it("fails closed when an editors-only hit has malformed editor IDs", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
    });
    const malformedSkill = {
      ...makeSkillDocument({
        workspace_id: workspace.sId,
        skill_id: makeSId("skill", {
          id: 999_999_999,
          workspaceId: workspace.id,
        }),
        availability: "editors",
      }),
      editor_user_ids: auth.getNonNullableUser().id,
    } as unknown as SkillSearchDocument;
    mockHits([malformedSkill]);

    const result = await searchSkillDocuments(auth, {
      searchTerm: "skill",
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([]);
    }
  });

  it.each([
    ["skill ID", { skill_id: 123 }],
    ["pod space ID", { pod_space_id: 123 }],
  ])("fails closed when a hit has a malformed %s", async (_field, overrides) => {
    const { auth } = await createPrivateApiMockRequest({ role: "user" });
    const malformedSkill = {
      ...makeSkillDocument(),
      ...overrides,
    } as unknown as SkillSearchDocument;
    mockHits([malformedSkill]);
    const fetchByIdsSpy = vi.spyOn(SpaceResource, "fetchByIds");

    const result = await searchSkillDocuments(auth, {
      searchTerm: "skill",
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([]);
    }
    expect(fetchByIdsSpy).not.toHaveBeenCalled();
  });

  it("allows an editors-only hit when the caller is an editor", async () => {
    const { auth } = await createPrivateApiMockRequest({ role: "user" });
    const skill = await SkillFactory.create(auth, {
      availability: "editors",
      name: "My editors-only search skill",
    });
    await auth.refresh();
    const document = await SkillSearchDocumentResource.fetchSearchDocument(
      auth,
      skill.sId
    );
    expect(document).not.toBeNull();
    if (!document) {
      return;
    }
    mockHits([document]);

    const result = await searchSkillDocuments(auth, {
      searchTerm: "skill",
      limit: 10,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual([document]);
    }
  });

  it("allows editors-only skills for API keys", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
    });
    vi.spyOn(auth, "isKey").mockReturnValue(true);
    const editorsOnlySkill = makeSkillDocument({
      skill_id: "editors-only",
      availability: "editors",
      editor_user_ids: [999_999_999],
    });
    mockHits([editorsOnlySkill]);
    vi.spyOn(
      SkillSearchDocumentResource,
      "filterSearchDocumentsByCurrentState"
    ).mockImplementation(async (_auth, candidates) => [...candidates]);

    const result = await searchSkillDocuments(auth, {
      searchTerm: "skill",
      limit: 10,
    });

    expect(mockClientSearch).toHaveBeenCalledOnce();
    expect(mockClientSearch.mock.calls[0][0].query.bool.filter).toEqual(
      expect.arrayContaining([
        { term: { workspace_id: workspace.sId } },
        { term: { status: "active" } },
      ])
    );
    expect(mockClientSearch.mock.calls[0][0].query.bool.filter).toHaveLength(3);
    expect(
      SkillSearchDocumentResource.filterSearchDocumentsByCurrentState
    ).toHaveBeenCalledWith(auth, [editorsOnlySkill]);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.map((document) => document.skill_id)).toEqual([
        "editors-only",
      ]);
    }
  });
});
