import { beforeEach, describe, expect, it, vi } from "vitest";

const mockClientSearch = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/elasticsearch", async () => {
  const { Ok } = await import("@app/types/shared/result");

  return {
    SKILL_SEARCH_ALIAS_NAME: "front.skills",
    withEs: async (
      fn: (client: { search: typeof mockClientSearch }) => Promise<unknown>
    ) => new Ok(await fn({ search: mockClientSearch })),
  };
});

import { Authenticator } from "@app/lib/auth";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  MAX_SKILL_SEARCH_RESULTS,
  prepareSkillSearchQuery,
  searchSkillDocumentCandidates,
} from "@app/lib/skill_search/search";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { SkillSearchFilters } from "@app/types/api/skills";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration_constants";
import { Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
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
    description: "Description",
    icon: null,
    last_edited_by_user_id: null,
    editor_ids: [],
    requested_space_ids: [],
    mcp_server_view_ids: [],
    active_users_count: 0,
    favorite_count: 0,
    created_at: "2026-08-01T00:00:00.000Z",
    updated_at: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function mockHits(documents: SkillSearchDocument[]) {
  mockClientSearch.mockResolvedValueOnce({
    hits: {
      hits: documents.map((document) => ({
        _source: document,
        sort: [1, document.name, String(document.skill_id)],
      })),
    },
  });
}

function expectedEditorFilter(auth: Authenticator) {
  return { term: { editor_ids: auth.getNonNullableUser().sId } };
}

// Exercise one candidate batch with the real authorization path. The API tests
// cover the cross-batch merge and cursor behavior.
async function searchSkillDocuments(
  auth: Authenticator,
  {
    searchTerm,
    limit,
    status,
  }: {
    searchTerm: string;
    limit: number;
    status?: SkillSearchFilters["status"];
  }
) {
  const query = prepareSkillSearchQuery(auth, searchTerm, "strict", {
    filters: { status },
  });
  const result = await searchSkillDocumentCandidates(auth, {
    query,
    searchAfter: null,
    limit: Math.min(200, Math.max(50, limit * 3)),
    status,
  });
  if (result.isErr()) {
    return result;
  }
  return new Ok(
    removeNulls(
      result.value.candidates.map((candidate) => candidate.skill)
    ).slice(0, limit)
  );
}

describe("skill_search/search", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockClientSearch.mockReset();
  });

  it("uses the mapped identifier fields for tool and editor filters", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "user",
    });
    const query = prepareSkillSearchQuery(auth, "", "strict", {
      filters: { toolIds: ["view-2", "view-1", "view-2"], editedByMe: true },
    });

    expect(query.bool?.filter).toEqual(
      expect.arrayContaining([
        { term: { workspace_id: workspace.sId } },
        { terms: { mcp_server_view_ids: ["view-1", "view-2"] } },
        expectedEditorFilter(auth),
      ])
    );
  });

  it.each([
    true,
    false,
  ])("filters isDefault=%s through availability", async (isDefault) => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "user",
    });
    const query = prepareSkillSearchQuery(auth, "", "strict", {
      filters: { isDefault },
    });
    const defaultFilter = { term: { availability: "users_and_agents" } };

    expect(query.bool?.filter).toEqual(
      expect.arrayContaining([
        { term: { workspace_id: workspace.sId } },
        isDefault ? defaultFilter : { bool: { must_not: [defaultFilter] } },
      ])
    );
    expect(JSON.stringify(query)).not.toContain("is_default");
  });

  it.each(
    (
      [
        { role: "user", keyFactory: null, label: "user" },
        { role: "builder", keyFactory: null, label: "builder" },
        { role: "manager", keyFactory: null, label: "manager" },
        { role: "admin", keyFactory: null, label: "admin" },
        {
          role: "user",
          keyFactory: KeyFactory.readOnly,
          label: "read-only key",
        },
        {
          role: "builder",
          keyFactory: KeyFactory.regular,
          label: "builder key",
        },
        { role: "admin", keyFactory: KeyFactory.admin, label: "admin key" },
      ] as const
    ).flatMap((access) =>
      (["active", "archived"] as const).map((status) => ({ ...access, status }))
    )
  )("enforces the space × pod × availability × editor matrix for $label / $status", async ({
    role,
    keyFactory,
    status,
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
    const skills: SkillResource[] = [];

    // Bounded Cartesian product: 5 space cases × 3 pod cases × 3 availabilities × 2 editor states.
    // Fixtures and auth/grant hydration stay real; only the ES boundary is mocked.
    for (const spaceCase of spaceCases) {
      for (const podCase of podCases) {
        for (const availability of SKILL_AVAILABILITIES) {
          for (const isEditor of [false, true]) {
            const skill = await SkillFactory.create(authorAuth, {
              name: `${spaceCase.label}, ${podCase.label}, ${availability}, editor=${isEditor}`,
              availability,
              status,
              addCurrentUserAsEditor: isEditor,
              requestedSpaceIds: [...spaceCase.spaces, ...podCase.spaces].map(
                (space) => space.id
              ),
            });
            skills.push(skill);
            const visibleByAvailability =
              availability !== "editors" || isEditor || keyFactory !== null;
            if (
              spaceCase.readable &&
              podCase.readable &&
              visibleByAvailability
            ) {
              esCandidateIds.add(skill.sId);
              expectedSkillIds.push(skill.sId);
            }
          }
        }
      }
    }
    const documents = await SkillFactory.createSearchDocuments(
      authorAuth,
      skills
    );
    expect(documents).toHaveLength(skills.length);
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
    // candidates. Pods participate in the same all-of filter as every other space.
    mockHits(
      documents.filter((document) => esCandidateIds.has(document.skill_id))
    );
    const result = await searchSkillDocuments(auth, {
      searchTerm: "",
      limit: MAX_SKILL_SEARCH_RESULTS,
      status: [status],
    });
    assert(result.isOk());
    expect(result.value.map((skill) => skill.sId)).toEqual(expectedSkillIds);
    expect(mockClientSearch).toHaveBeenCalledOnce();
    expect(mockClientSearch.mock.calls[0][0].query.bool.must[0]).toEqual({
      bool: {
        must: [{ match_all: {} }],
        filter: [
          { term: { workspace_id: workspace.sId } },
          { terms: { status: [status] } },
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
                            expectedEditorFilter(auth),
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
                {
                  bool: {
                    must_not: [{ exists: { field: "requested_space_ids" } }],
                  },
                },
                {
                  terms_set: {
                    requested_space_ids: {
                      terms: expect.arrayContaining([
                        globalSpace.sId,
                        conversationsSpace.sId,
                        readableSpace.sId,
                        readablePod.sId,
                        extraSpace.sId,
                      ]),
                      minimum_should_match_script: {
                        source: "doc['requested_space_ids'].size()",
                      },
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
    const filters =
      mockClientSearch.mock.calls[0][0].query.bool.must[0].bool.filter;
    const spaceTerms =
      filters.at(-1).bool.should[1].terms_set.requested_space_ids.terms;
    expect(spaceTerms).toHaveLength(5);
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
    const skills: SkillResource[] = [];
    const expectedSkillIds: string[] = [];
    for (const availability of SKILL_AVAILABILITIES) {
      for (const isEditor of [false, true]) {
        const skill = await SkillFactory.create(auth, {
          name: `${availability}, editor=${isEditor}`,
          availability,
          addCurrentUserAsEditor: isEditor,
          requestedSpaceIds: [pod.id],
        });
        skills.push(skill);
        if (access !== "denied" && (availability !== "editors" || isEditor)) {
          expectedSkillIds.push(skill.sId);
        }
      }
    }
    await auth.refresh();
    expect(auth.can("read", pod)).toBe(access !== "denied");
    expect(pod.isMember(auth)).toBe(access === "member" || access === "editor");
    const documents = await SkillFactory.createSearchDocuments(auth, skills);
    expect(documents).toHaveLength(skills.length);
    // Deliberately include non-editor hits: the live editor guard must also fail closed.
    mockHits(documents);
    const result = await searchSkillDocuments(auth, {
      searchTerm: "",
      limit: 10,
    });
    assert(result.isOk());
    expect(result.value.map((skill) => skill.sId)).toEqual(expectedSkillIds);
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
    const [document] = await SkillFactory.createSearchDocuments(auth, [skill]);
    assert(document);
    mockHits([document]);
    const before = await searchSkillDocuments(auth, {
      searchTerm: "",
      limit: 10,
    });
    assert(before.isOk());
    expect(before.value).toEqual([skill.toSearchJSON(auth, 1)]);

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

  it("requires every requested space to match a readable user space", async () => {
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
      index: "front.skills",
      size: 50,
      sort: [
        { _score: { order: "desc" } },
        { "name.keyword": { order: "asc" } },
        { skill_id: { order: "asc" } },
      ],
    });
    expect(request).not.toHaveProperty("pit");
    expect(request.query.bool.must[0].bool.must[0]).toMatchObject({
      multi_match: { query: "summarize", type: "bool_prefix" },
    });

    const filters = request.query.bool.must[0].bool.filter;
    expect(filters).toEqual(
      expect.arrayContaining([
        { term: { workspace_id: workspace.sId } },
        { terms: { status: ["active"] } },
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
                expectedEditorFilter(auth),
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
          {
            bool: { must_not: [{ exists: { field: "requested_space_ids" } }] },
          },
          {
            terms_set: {
              requested_space_ids: {
                minimum_should_match_script: {
                  source: "doc['requested_space_ids'].size()",
                },
              },
            },
          },
        ],
      },
    });
    expect(
      filters[3].bool.should[1].terms_set.requested_space_ids.terms
    ).toContain(globalSpace.sId);
  });

  it("only accepts skills with no requested spaces when a key has no grants", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });
    const emptyGroup = await GroupFactory.regularManual(
      workspace,
      "No space grants"
    );
    const key = await KeyFactory.readOnly(emptyGroup);
    const auth = await Authenticator.fromKey(key, workspace.sId);
    mockHits([]);

    await searchSkillDocuments(auth, { searchTerm: "   ", limit: 10 });

    const request = mockClientSearch.mock.calls[0][0];
    expect(request.query.bool.must[0].bool.filter.at(-1)).toEqual({
      bool: { must_not: [{ exists: { field: "requested_space_ids" } }] },
    });
    expect(request.query.bool.must[0].bool.should).toBeUndefined();
    expect(request.sort).toEqual([
      { _score: { order: "desc" } },
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
    expect(request.query.bool.must[0].bool.filter[2]).toEqual({
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
    "report b",
    "*",
    "?",
    "\\",
    "a*b?c\\d",
    "a.b",
  ])("builds a word-prefix query without interpreting wildcard syntax for %s", async (query) => {
    const { auth } = await createPrivateApiMockRequest({ role: "user" });
    mockHits([]);

    await searchSkillDocuments(auth, { searchTerm: query, limit: 10 });

    const match =
      mockClientSearch.mock.calls[0][0].query.bool.must[0].bool.must[0];
    expect(match.multi_match).toEqual({
      query,
      type: "bool_prefix",
      operator: "and",
      fields: [
        "name.autocomplete",
        "name.autocomplete._2gram",
        "name.autocomplete._3gram",
      ],
    });
  });

  it("derives open and restricted pod access from grants without a space fetch", async () => {
    const { auth, workspace, user, globalGroup } =
      await createPrivateApiMockRequest({ role: "user" });
    const readablePod = await SpaceFactory.project(workspace, user.id);
    const openPod = await SpaceFactory.project(workspace);
    await SpaceFactory.attachGroup(openPod, globalGroup, "project_viewer");
    const unreadablePod = await SpaceFactory.project(workspace);
    await auth.refresh();
    const fetchByIdsSpy = vi.spyOn(SpaceResource, "fetchByIds");
    const listSpacesSpy = vi.spyOn(SpaceResource, "listWorkspaceSpaces");
    mockHits([]);

    await searchSkillDocuments(auth, { searchTerm: "skill", limit: 2 });

    const filters =
      mockClientSearch.mock.calls[0][0].query.bool.must[0].bool.filter;
    const spaceIds =
      filters.at(-1).bool.should[1].terms_set.requested_space_ids.terms;
    expect(spaceIds).toContain(readablePod.sId);
    expect(spaceIds).toContain(openPod.sId);
    expect(spaceIds).not.toContain(unreadablePod.sId);
    expect(fetchByIdsSpy).not.toHaveBeenCalled();
    expect(listSpacesSpy).not.toHaveBeenCalled();
    expect(mockClientSearch).toHaveBeenCalledOnce();
  });

  it("uses wildcard read grants without enumerating spaces for a system key", async () => {
    const { workspace, globalGroup } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const key = await KeyFactory.system(globalGroup);
    const auth = await Authenticator.fromKey(key, workspace.sId);
    const fetchByIdsSpy = vi.spyOn(SpaceResource, "fetchByIds");
    mockHits([]);

    await searchSkillDocuments(auth, { searchTerm: "", limit: 10 });

    const filters =
      mockClientSearch.mock.calls[0][0].query.bool.must[0].bool.filter;
    expect(filters).toEqual([
      { term: { workspace_id: workspace.sId } },
      { terms: { status: ["active"] } },
      { match_all: {} },
    ]);
    expect(fetchByIdsSpy).not.toHaveBeenCalled();
  });

  it("rejects an editors-only hit when the caller is not an editor", async () => {
    const { auth } = await createPrivateApiMockRequest({
      role: "user",
    });
    const skill = await SkillFactory.create(auth, {
      availability: "editors",
      addCurrentUserAsEditor: false,
    });
    const [document] = await SkillFactory.createSearchDocuments(auth, [skill]);
    assert(document);
    expect(skill.canWrite(auth)).toBe(false);
    mockHits([
      {
        ...document,
        editor_ids: [auth.getNonNullableUser().sId],
      },
    ]);

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
    "scalar",
    "numeric",
  ] as const)("fails closed when an editors-only hit has %s editor IDs", async (kind) => {
    const { auth } = await createPrivateApiMockRequest({
      role: "user",
    });
    const skill = await SkillFactory.create(auth, { availability: "editors" });
    const [document] = await SkillFactory.createSearchDocuments(auth, [skill]);
    assert(document);
    const user = auth.getNonNullableUser();
    const malformedSkill = {
      ...document,
      editor_ids: kind === "scalar" ? user.sId : [user.id],
    };
    // @ts-expect-error Elasticsearch can return malformed or old numeric editor IDs.
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
    ["space IDs", { requested_space_ids: 123 }],
    ["space ID", { requested_space_ids: [123] }],
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
    const [document] = await SkillFactory.createSearchDocuments(auth, [skill]);
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
      expect(result.value).toEqual([skill.toSearchJSON(auth, 1)]);
    }
  });

  it("allows editors-only skills for API keys", async () => {
    const {
      auth: authorAuth,
      workspace,
      globalGroup,
    } = await createPrivateApiMockRequest({
      role: "user",
    });
    const skill = await SkillFactory.create(authorAuth, {
      availability: "editors",
    });
    const [editorsOnlySkill] = await SkillFactory.createSearchDocuments(
      authorAuth,
      [skill]
    );
    assert(editorsOnlySkill);
    const key = await KeyFactory.readOnly(globalGroup);
    const auth = await Authenticator.fromKey(key, workspace.sId);
    mockHits([editorsOnlySkill]);

    const result = await searchSkillDocuments(auth, {
      searchTerm: "skill",
      limit: 10,
    });

    expect(mockClientSearch).toHaveBeenCalledOnce();
    expect(
      mockClientSearch.mock.calls[0][0].query.bool.must[0].bool.filter
    ).toEqual(
      expect.arrayContaining([
        { term: { workspace_id: workspace.sId } },
        { terms: { status: ["active"] } },
      ])
    );
    expect(
      mockClientSearch.mock.calls[0][0].query.bool.must[0].bool.filter
    ).toHaveLength(3);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.map((skill) => skill.sId)).toEqual([skill.sId]);
    }
  });
});
