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
import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { makeSId } from "@app/lib/resources/string_ids";
import {
  MAX_SKILL_SEARCH_RESULTS,
  searchSkillDocuments,
} from "@app/lib/skill_search/search";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration_constants";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
import assert from "assert";

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

  it.each([
    { role: "user", keyFactory: null, label: "user" },
    { role: "builder", keyFactory: null, label: "builder" },
    { role: "manager", keyFactory: null, label: "manager" },
    { role: "admin", keyFactory: null, label: "admin" },
    { role: "user", keyFactory: KeyFactory.readOnly, label: "read-only key" },
    { role: "builder", keyFactory: KeyFactory.regular, label: "builder key" },
    { role: "admin", keyFactory: KeyFactory.admin, label: "admin key" },
  ] as const)("enforces the space × pod × availability × editor matrix for $label", async ({
    role,
    keyFactory,
  }) => {
    const {
      authenticator: authorAuth,
      workspace,
      user,
      globalGroup,
      globalSpace,
      conversationsSpace,
    } = await createResourceTest({ role });
    const readableSpace = await SpaceFactory.regular(workspace);
    const spaceMemberGroup =
      await readableSpace.fetchManualMemberGroup(authorAuth);
    assert(spaceMemberGroup);
    await GroupFactory.withMembers(authorAuth, spaceMemberGroup, [user]);
    const deniedSpace = await SpaceFactory.regular(workspace);
    const readablePod = await SpaceFactory.project(workspace);
    const podMemberGroup = await readablePod.fetchManualMemberGroup(authorAuth);
    assert(podMemberGroup);
    await GroupFactory.withMembers(authorAuth, podMemberGroup, [user]);
    const deniedPod = await SpaceFactory.project(workspace);
    // An unrelated readable space catches reversing the subset predicate.
    const extraSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(extraSpace, globalGroup);

    const spaceCases = [
      { label: "no spaces", spaces: [], readable: true },
      { label: "all spaces", spaces: [readableSpace], readable: true },
      {
        label: "two readable spaces",
        spaces: [readableSpace, extraSpace],
        readable: true,
      },
      { label: "no space access", spaces: [deniedSpace], readable: false },
      {
        label: "partial space access",
        spaces: [readableSpace, deniedSpace],
        readable: false,
      },
    ];
    const podCases = [
      { label: "no pod", spaces: [], readable: true },
      { label: "readable pod", spaces: [readablePod], readable: true },
      { label: "denied pod", spaces: [deniedPod], readable: false },
    ];
    const esCandidateIds = new Set<string>();
    const expectedSkillIds: string[] = [];
    const skillIds: string[] = [];

    // Bounded Cartesian product: 5 space cases × 3 pod cases × 3 availabilities × 2 editor states.
    // Fixtures and auth/grant hydration stay real; only the ES boundary is mocked.
    for (const spaceCase of spaceCases) {
      for (const podCase of podCases) {
        for (const availability of SKILL_AVAILABILITIES) {
          for (const isEditor of [false, true]) {
            const skill = await SkillFactory.create(authorAuth, {
              name: `${spaceCase.label}, ${podCase.label}, ${availability}, editor=${isEditor}`,
              availability,
              addCurrentUserAsEditor: isEditor,
              requestedSpaceIds: [...spaceCase.spaces, ...podCase.spaces].map(
                (space) => space.id
              ),
            });
            skillIds.push(skill.sId);
            const visibleByAvailability =
              availability !== "editors" || isEditor || keyFactory !== null;
            if (spaceCase.readable && visibleByAvailability) {
              esCandidateIds.add(skill.sId);
              if (podCase.readable) {
                expectedSkillIds.push(skill.sId);
              }
            }
          }
        }
      }
    }
    const documents = await SkillSearchDocumentResource.fetchSearchDocuments(
      authorAuth,
      skillIds
    );
    expect(documents).toHaveLength(skillIds.length);
    let auth = authorAuth;
    if (keyFactory) {
      const key = await keyFactory([
        globalGroup,
        spaceMemberGroup,
        podMemberGroup,
      ]);
      auth = await Authenticator.fromKey(key, workspace.sId);
    }
    await auth.refresh();
    expect(auth.can("read", readableSpace)).toBe(true);
    expect(auth.can("read", deniedSpace)).toBe(false);
    expect(auth.can("read", readablePod)).toBe(true);
    expect(auth.can("read", deniedPod)).toBe(false);

    // ES is not executed here: assert its full ACL contract below, then supply its expected
    // candidates, including unreadable pods that the real post-filter must reject.
    mockHits(
      documents.filter((document) => esCandidateIds.has(document.skill_id))
    );
    const result = await searchSkillDocuments(auth, {
      searchTerm: "",
      limit: MAX_SKILL_SEARCH_RESULTS,
    });
    assert(result.isOk());
    expect(result.value.map((document) => document.skill_id)).toEqual(
      expectedSkillIds
    );
    expect(mockClientSearch).toHaveBeenCalledOnce();
    expect(mockClientSearch.mock.calls[0][0].query).toEqual({
      bool: {
        filter: [
          { term: { workspace_id: workspace.sId } },
          { term: { status: "active" } },
          ...(keyFactory
            ? []
            : [
                {
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
                },
              ]),
          {
            bool: {
              should: [
                { term: { non_pod_space_count: 0 } },
                {
                  terms_set: {
                    non_pod_space_ids: {
                      terms: expect.arrayContaining([
                        globalSpace.sId,
                        conversationsSpace.sId,
                        readableSpace.sId,
                        extraSpace.sId,
                      ]),
                      minimum_should_match_field: "non_pod_space_count",
                    },
                  },
                },
              ],
              minimum_should_match: 1,
            },
          },
        ],
      },
    });
    const filters = mockClientSearch.mock.calls[0][0].query.bool.filter;
    const spaceTerms =
      filters.at(-1).bool.should[1].terms_set.non_pod_space_ids.terms;
    expect(spaceTerms).toHaveLength(4);
  }, 30_000);

  it.each([
    "open",
    "member",
    "editor",
    "denied",
  ] as const)("combines %s pod access with skill editorship and availability", async (access) => {
    const { auth, workspace, user, globalGroup } =
      await createPrivateApiMockRequest({ role: "user" });
    const pod = await SpaceFactory.project(
      workspace,
      access === "editor" ? user.id : undefined
    );
    if (access === "open") {
      await SpaceFactory.attachGroup(pod, globalGroup, "project_viewer");
    }
    if (access === "member") {
      const members = await pod.fetchManualMemberGroup(auth);
      assert(members);
      await GroupFactory.withMembers(auth, members, [user]);
    }
    const skillIds: string[] = [];
    const expectedSkillIds: string[] = [];
    for (const availability of SKILL_AVAILABILITIES) {
      for (const isEditor of [false, true]) {
        const skill = await SkillFactory.create(auth, {
          name: `${availability}, editor=${isEditor}`,
          availability,
          addCurrentUserAsEditor: isEditor,
          requestedSpaceIds: [pod.id],
        });
        skillIds.push(skill.sId);
        if (access !== "denied" && (availability !== "editors" || isEditor)) {
          expectedSkillIds.push(skill.sId);
        }
      }
    }
    await auth.refresh();
    expect(auth.can("read", pod)).toBe(access !== "denied");
    expect(pod.isMember(auth)).toBe(access === "member" || access === "editor");
    const documents = await SkillSearchDocumentResource.fetchSearchDocuments(
      auth,
      skillIds
    );
    expect(documents).toHaveLength(skillIds.length);
    // Deliberately include non-editor hits: the live editor guard must also fail closed.
    mockHits(documents);
    const result = await searchSkillDocuments(auth, {
      searchTerm: "",
      limit: 10,
    });
    assert(result.isOk());
    expect(result.value.map((document) => document.skill_id)).toEqual(
      expectedSkillIds
    );
  });

  it.each([
    "pod",
    "editor",
  ] as const)("rejects a previously visible hit after revoking %s access without reindexing", async (access) => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      role: "user",
    });
    const pod = await SpaceFactory.project(workspace, user.id);
    const skill = await SkillFactory.create(auth, {
      availability: "editors",
      requestedSpaceIds: [pod.id],
    });
    const document = await SkillSearchDocumentResource.fetchSearchDocument(
      auth,
      skill.sId
    );
    assert(document);
    mockHits([document]);
    const before = await searchSkillDocuments(auth, {
      searchTerm: "",
      limit: 10,
    });
    assert(before.isOk());
    expect(before.value).toEqual([document]);

    if (access === "pod") {
      await pod.writeGroupPermissions(auth, { members: [], editors: [] });
    } else {
      const removeResult = await skill.removeEditors(auth, [user]);
      expect(removeResult.isOk()).toBe(true);
    }
    await auth.refresh();
    mockHits([document]);
    const after = await searchSkillDocuments(auth, {
      searchTerm: "",
      limit: 10,
    });
    assert(after.isOk());
    expect(after.value).toEqual([]);
    expect(mockClientSearch).toHaveBeenCalledTimes(2);
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
