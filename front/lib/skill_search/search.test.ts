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

import { Authenticator } from "@app/lib/auth";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { searchSkillDocuments } from "@app/lib/skill_search/search";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
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
    agent_facing_description: "Agent description",
    icon: null,
    edited_by: null,
    editor_group_id: "group",
    requested_space_ids: [],
    non_pod_space_ids: [],
    non_pod_space_count: 0,
    pod_space_id: null,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function mockHits(documents: SkillSearchDocument[]) {
  mockClientSearch.mockResolvedValue({
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
    const { auth, workspace, globalSpace } = await createPrivateApiMockRequest({
      role: "user",
    });
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
    expect(filters[2]).toMatchObject({
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
      filters[2].bool.should[1].terms_set.non_pod_space_ids.terms
    ).toContain(globalSpace.sId);
  });

  it("only accepts skills with no non-pod spaces when the user has none", async () => {
    const { auth } = await createPrivateApiMockRequest({ role: "user" });
    vi.spyOn(SpaceResource, "listWorkspaceSpaces").mockResolvedValue([]);
    mockHits([]);

    await searchSkillDocuments(auth, { searchTerm: "   ", limit: 10 });

    const request = mockClientSearch.mock.calls[0][0];
    expect(request.query.bool.filter[2]).toEqual({
      term: { non_pod_space_count: 0 },
    });
    expect(request.query.bool.should).toBeUndefined();
    expect(request.sort).toEqual([
      { "name.keyword": { order: "asc" } },
      { skill_id: { order: "asc" } },
    ]);
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

  it("checks only candidate pods and editor groups after Elasticsearch", async () => {
    const { workspace, user, globalGroup } = await createPrivateApiMockRequest({
      role: "user",
    });
    const readablePod = await SpaceFactory.project(workspace, user.id);
    const openPod = await SpaceFactory.project(workspace);
    await GroupSpaceFactory.associate(openPod, globalGroup);
    const unreadablePod = await SpaceFactory.project(workspace);
    const missingPodId = SpaceResource.modelIdToSId({
      id: 999_999_999,
      workspaceId: workspace.id,
    });

    const editorGroup = await GroupResource.makeNew(
      {
        name: "search-test-skill-editors",
        kind: "skill_editors",
        workspaceId: workspace.id,
      },
      { memberIds: [user.id] }
    );
    const otherEditorGroup = await GroupResource.makeNew({
      name: "search-test-other-skill-editors",
      kind: "skill_editors",
      workspaceId: workspace.id,
    });

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const documents = [
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
        skill_id: "unreadable-pod",
        pod_space_id: unreadablePod.sId,
      }),
      makeSkillDocument({
        skill_id: "missing-pod",
        pod_space_id: missingPodId,
      }),
      makeSkillDocument({
        skill_id: "my-editors-only",
        availability: "editors",
        editor_group_id: editorGroup.sId,
      }),
      makeSkillDocument({
        skill_id: "other-editors-only",
        availability: "editors",
        editor_group_id: otherEditorGroup.sId,
      }),
    ];
    mockHits(documents);
    vi.spyOn(
      SkillSearchDocumentResource,
      "filterSearchDocumentsByCurrentState"
    ).mockImplementation(async (_auth, candidates) => [...candidates]);
    const fetchByIdsSpy = vi.spyOn(SpaceResource, "fetchByIds");

    const result = await searchSkillDocuments(auth, {
      searchTerm: "skill",
      limit: 10,
    });

    expect(fetchByIdsSpy).toHaveBeenCalledWith(auth, [
      readablePod.sId,
      openPod.sId,
      unreadablePod.sId,
      missingPodId,
    ]);
    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.map((document) => document.skill_id)).toEqual([
      "no-pod",
      "readable-pod",
      "open-pod",
      "my-editors-only",
    ]);
  });
});
