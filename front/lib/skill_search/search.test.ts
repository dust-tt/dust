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

import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import {
  buildSkillSearchQuery,
  searchSkills,
} from "@app/lib/skill_search/search";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { matchesSkillSearchFilters } from "@app/tests/utils/skill_search";
import type { SkillSearchFilters } from "@app/types/api/skills";
import {
  SkillListItemSchema,
  SkillSchema,
} from "@app/types/assistant/skill_configuration";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration_constants";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
import type { estypes } from "@elastic/elasticsearch";
import assert from "assert";

async function mockHits(
  auth: Authenticator,
  skills: SkillResource[],
  extraDocuments: SkillSearchDocument[] = []
) {
  const documents = [
    ...(await SkillFactory.createSearchDocuments(auth, skills)),
    ...extraDocuments,
  ];
  mockSearch.mockImplementation(async (request: estypes.SearchRequest) => ({
    hits: {
      hits: documents
        .filter((document) =>
          matchesSkillSearchFilters(document, request.query!)
        )
        .map((document) => ({
          _source: document,
          sort: [1, document.name, document.skill_id],
        })),
    },
  }));
  return documents;
}

async function searchListings(
  auth: Authenticator,
  options: {
    searchTerm: string;
    filters?: SkillSearchFilters;
  } = { searchTerm: "" }
) {
  const result = await searchSkills(auth, {
    ...options,
    limit: 200,
  });
  assert(result.isOk());
  return result.value;
}

describe("custom skill search", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queries name prefixes with workspace, status, all-space and editor filters", async () => {
    const {
      authenticator: auth,
      workspace,
      globalSpace,
      conversationsSpace,
    } = await createResourceTest({ role: "user" });
    const query = buildSkillSearchQuery(auth, { searchTerm: "report b" });
    expect(query).toEqual({
      bool: {
        must: [
          {
            multi_match: {
              query: "report b",
              type: "bool_prefix",
              operator: "and",
              fields: [
                "name.autocomplete",
                "name.autocomplete._2gram",
                "name.autocomplete_preserved",
                "name.autocomplete_preserved._2gram",
              ],
            },
          },
        ],
        filter: [
          { term: { workspace_id: workspace.sId } },
          { terms: { status: ["active"] } },
          {
            bool: {
              should: [
                {
                  terms: {
                    availability: ["workspace_users", "users_and_agents"],
                  },
                },
                { term: { editor_ids: auth.getNonNullableUser().sId } },
              ],
              minimum_should_match: 1,
            },
          },
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
                      terms: [globalSpace.sId, conversationsSpace.sId].sort(),
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
  });

  it("keeps skills without requested spaces workspace-scoped without database queries", async () => {
    const { authenticator: auth } = await createResourceTest({
      role: "user",
    });
    const other = await createResourceTest({ role: "user" });
    const skill = await SkillFactory.create(auth, {
      requestedSpaceIds: [],
    });
    const foreign = await SkillFactory.create(other.authenticator, {
      requestedSpaceIds: [],
    });
    const foreignDocuments = await SkillFactory.createSearchDocuments(
      other.authenticator,
      [foreign]
    );
    await mockHits(auth, [skill], foreignDocuments);
    const onQuery = vi.fn();
    frontSequelize.addHook("afterQuery", "skill-search-no-db", onQuery);
    try {
      const result = await searchSkills(auth, { searchTerm: "", limit: 10 });
      assert(result.isOk());
      expect(result.value.map((item) => item.sId)).toEqual([skill.sId]);
      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          index: "front.skills",
          query: buildSkillSearchQuery(auth, { searchTerm: "" }),
          size: 10,
        })
      );
      expect(onQuery).not.toHaveBeenCalled();
    } finally {
      frontSequelize.removeHook("afterQuery", "skill-search-no-db");
    }
  });

  it.each([
    true,
    undefined,
  ] as const)("adds selection filters without replacing ACLs (editedByMe=%s)", async (editedByMe) => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    const base = buildSkillSearchQuery(auth, { searchTerm: "" });
    const query = buildSkillSearchQuery(auth, {
      searchTerm: "",
      filters: {
        mcpServerViewIds: ["view-2", "view-1", "view-2"],
        availability: ["users_and_agents"],
        editedByMe,
      },
    });
    const editor = { term: { editor_ids: auth.getNonNullableUser().sId } };
    expect(query.bool?.filter).toEqual([
      ...[base.bool?.filter].flat(),
      { terms: { mcp_server_view_ids: ["view-1", "view-2"] } },
      { terms: { availability: ["users_and_agents"] } },
      ...(editedByMe ? [editor] : []),
    ]);
  });

  it("defaults to active skills and allows selecting archived skills without requested spaces", async () => {
    const { authenticator: auth } = await createResourceTest({
      role: "user",
    });
    const active = await SkillFactory.create(auth, {
      requestedSpaceIds: [],
    });
    const archived = await SkillFactory.create(auth, {
      status: "archived",
      requestedSpaceIds: [],
    });
    await mockHits(auth, [active, archived]);

    const defaults = await searchListings(auth);
    expect(defaults.map((skill) => skill.sId)).toEqual([active.sId]);

    const both = await searchListings(auth, {
      searchTerm: "",
      filters: { status: ["active", "archived"] },
    });
    expect(both.map((skill) => skill.sId)).toEqual([active.sId, archived.sId]);
  });

  it.each(
    (["user", "builder", "manager", "admin"] as const).flatMap((role) =>
      (["active", "archived"] as const).map((status) => ({ role, status }))
    )
  )("enforces every space/pod/availability/editor combination for $role / $status", async ({
    role,
    status,
  }) => {
    const {
      authenticator: auth,
      workspace,
      user,
      globalGroup,
      globalSpace,
    } = await createResourceTest({ role });
    const readableSpace = await SpaceFactory.regular(workspace);
    const readablePod = await SpaceFactory.project(workspace);
    const spaceMembers = await readableSpace.fetchManualMemberGroup(auth);
    const podMembers = await readablePod.fetchManualMemberGroup(auth);
    assert(spaceMembers && podMembers);
    await GroupFactory.withMembers(auth, spaceMembers, [user]);
    await GroupFactory.withMembers(auth, podMembers, [user]);
    const deniedSpace = await SpaceFactory.regular(workspace);
    const deniedPod = await SpaceFactory.project(workspace);
    const extraSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(extraSpace, globalGroup);
    const spaceCases = [
      { spaces: [], readable: true },
      { spaces: [globalSpace], readable: true },
      { spaces: [readableSpace], readable: true },
      { spaces: [readableSpace, extraSpace], readable: true },
      { spaces: [deniedSpace], readable: false },
      { spaces: [readableSpace, deniedSpace], readable: false },
    ];
    const podCases = [
      { spaces: [], readable: true },
      { spaces: [readablePod], readable: true },
      { spaces: [deniedPod], readable: false },
    ];
    const skills: SkillResource[] = [];
    const expectedIds: string[] = [];
    // Bounded matrix: 6 space cases × 3 pod cases × 3 availabilities × 2 editor states.
    for (const space of spaceCases) {
      for (const pod of podCases) {
        for (const availability of SKILL_AVAILABILITIES) {
          for (const isEditor of [false, true]) {
            const skill = await SkillFactory.create(auth, {
              name: `Matrix skill ${skills.length}`,
              availability,
              status,
              addCurrentUserAsEditor: isEditor,
              requestedSpaceIds: [...space.spaces, ...pod.spaces].map(
                (s) => s.id
              ),
            });
            skills.push(skill);
            if (
              space.readable &&
              pod.readable &&
              (availability !== "editors" || isEditor)
            ) {
              expectedIds.push(skill.sId);
            }
          }
        }
      }
    }
    await auth.refresh();
    // The ES mock applies the generated filters before returning hits.
    await mockHits(auth, skills);
    const candidates = await searchListings(auth, {
      searchTerm: "",
      filters: { status: [status] },
    });
    expect(candidates.map((skill) => skill.sId)).toEqual(expectedIds);
    expect(candidates).toHaveLength(expectedIds.length);
    expect(mockSearch).toHaveBeenCalledOnce();
    const filters = mockSearch.mock.lastCall![0].query.bool.filter;
    const terms =
      filters.at(-1).bool.should[1].terms_set.requested_space_ids.terms;
    expect(terms).toEqual(
      expect.arrayContaining([
        readableSpace.sId,
        extraSpace.sId,
        readablePod.sId,
      ])
    );
    expect(terms).not.toContain(deniedSpace.sId);
    expect(terms).not.toContain(deniedPod.sId);
    expect(filters).toHaveLength(4);
    expect(filters[2].bool.should[1]).toEqual({
      term: { editor_ids: user.sId },
    });
  }, 30_000);

  it.each([
    "open",
    "member",
    "editor",
    "denied",
  ] as const)("honors %s pod access for editors-only skills", async (access) => {
    const {
      authenticator: auth,
      workspace,
      user,
      globalGroup,
    } = await createResourceTest({ role: "user" });
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
    const skill = await SkillFactory.create(auth, {
      availability: "editors",
      requestedSpaceIds: [pod.id],
    });
    await auth.refresh();
    await mockHits(auth, [skill]);
    const [candidate] = await searchListings(auth);
    expect(candidate?.sId ?? null).toBe(access === "denied" ? null : skill.sId);
  });

  it.each([
    "pod",
    "editor",
    "availability",
    "archive",
    "delete",
  ] as const)("uses current grants but indexed skill metadata after a change to %s", async (change) => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({ role: "user" });
    const pod = await SpaceFactory.project(workspace, user.id);
    const skill = await SkillFactory.create(auth, {
      availability: change === "editor" ? "editors" : "workspace_users",
      requestedSpaceIds: [pod.id],
    });
    // Publishing first permits removal of the caller's editor grant before making it private.
    if (change === "availability") {
      expect((await skill.removeEditors(auth, [user])).isOk()).toBe(true);
    }
    await mockHits(auth, [skill]);
    const [before] = await searchListings(auth);
    expect(before.sId).toBe(skill.sId);
    switch (change) {
      case "pod":
        await pod.writeGroupPermissions(auth, { members: [], editors: [] });
        break;
      case "editor":
        expect((await skill.removeEditors(auth, [user])).isOk()).toBe(true);
        break;
      case "availability": {
        const admin = await Authenticator.internalAdminForWorkspace(
          workspace.sId
        );
        await SkillResource.updateAvailabilities(admin, [skill], "editors");
        break;
      }
      case "archive":
        await skill.archive(auth);
        break;
      case "delete":
        expect((await skill.delete(auth)).isOk()).toBe(true);
        break;
    }
    await auth.refresh();
    const [after] = await searchListings(auth);
    if (change === "pod") {
      expect(after).toBeUndefined();
    } else {
      // Skill fields are eventually consistent until the document is refreshed or deleted.
      expect(after).toEqual(before);
      if (change === "delete") {
        await mockHits(auth, []);
        expect(await searchListings(auth)).toEqual([]);
      } else {
        const current = await SkillResource.fetchById(auth, skill.sId);
        assert(current);
        await mockHits(auth, [current]);
        const [refreshed] = await searchListings(auth);
        expect(refreshed).toBeUndefined();
      }
    }
  });

  it("omits hits without source documents and preserves hit order", async () => {
    const { authenticator: auth, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const first = await SkillFactory.create(auth, {
      name: "First",
      requestedSpaceIds: [globalSpace.id],
    });
    const second = await SkillFactory.create(auth, {
      name: "Second",
      requestedSpaceIds: [globalSpace.id],
    });
    const documents = await mockHits(auth, [first, second]);
    const expected = await searchListings(auth);
    const hits = documents.map((document) => ({
      _source: document,
      sort: [1, document.name, document.skill_id],
    }));
    mockSearch.mockResolvedValue({
      hits: {
        hits: [hits[0], { sort: [1, "Missing", "missing-skill"] }, hits[1]],
      },
    });

    expect(await searchListings(auth)).toEqual(expected);
  });

  it("returns only indexed listing metadata without querying the database", async () => {
    const { authenticator: auth, globalSpace } = await createResourceTest({
      role: "admin",
    });
    const other = await createResourceTest({ role: "admin" });
    const active = await SkillFactory.create(auth, {
      availability: "workspace_users",
      instructions: "Private instructions",
      requestedSpaceIds: [globalSpace.id],
    });
    const archived = await SkillFactory.create(auth, {
      status: "archived",
      requestedSpaceIds: [globalSpace.id],
    });
    const suggested = await SkillFactory.create(auth, { status: "suggested" });
    const foreign = await SkillFactory.create(other.authenticator);
    const foreignDocuments = await SkillFactory.createSearchDocuments(
      other.authenticator,
      [foreign]
    );
    const documents = await mockHits(
      auth,
      [active, archived, suggested],
      foreignDocuments
    );
    documents[0].name = "Indexed name";
    documents[0].description = "Indexed description";
    documents[0].active_users_count = null;
    documents[0].mcp_server_view_ids = ["tool-view-id"];
    const onQuery = vi.fn();
    frontSequelize.addHook("afterQuery", "skill-search-no-db", onQuery);
    try {
      const defaults = await searchListings(auth);
      expect(defaults.map((skill) => skill.sId)).toEqual([active.sId]);
      const both = await searchListings(auth, {
        searchTerm: "",
        filters: { status: ["active", "archived"] },
      });
      expect(both.map((skill) => skill.sId)).toEqual([
        active.sId,
        archived.sId,
      ]);
      const listing = both[0];
      expect(SkillListItemSchema.strict().parse(listing)).toEqual({
        sId: active.sId,
        status: "active",
        name: "Indexed name",
        userFacingDescription: "Indexed description",
        icon: active.icon,
        requestedSpaceIds: [globalSpace.sId],
        mcpServerViewIds: ["tool-view-id"],
        editorIds: [auth.getNonNullableUser().sId],
        availability: "workspace_users",
        activeUsersCount: null,
        updatedAt: active.updatedAt.getTime(),
      });
      expect(SkillSchema.safeParse(listing).success).toBe(false);
      expect(mockSearch.mock.lastCall![0]).toMatchObject({
        index: "front.skills",
        _source: true,
        query: buildSkillSearchQuery(auth, {
          searchTerm: "",
          filters: { status: ["active", "archived"] },
        }),
      });
      expect(onQuery).not.toHaveBeenCalled();
    } finally {
      frontSequelize.removeHook("afterQuery", "skill-search-no-db");
    }
  });

  it("handles absent and type-wide space grants without enumerating spaces", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
      globalSpace,
      conversationsSpace,
    } = await createResourceTest({ role: "user" });
    const unrestricted = await SkillFactory.create(auth, {
      name: "No required spaces",
      requestedSpaceIds: [],
    });
    const restricted = await SkillFactory.create(auth, {
      name: "Requires the global space",
      requestedSpaceIds: [globalSpace.id],
    });
    await mockHits(auth, [unrestricted, restricted]);

    await globalSpace.writeGroupPermissions(auth, { members: [], editors: [] });
    await conversationsSpace.writeGroupPermissions(auth, {
      members: [],
      editors: [],
    });
    await auth.refresh();
    expect(auth.getReadableSpaceModelIds()).toEqual({
      kind: "ids",
      resourceIds: [],
    });
    expect(
      buildSkillSearchQuery(auth, { searchTerm: "" }).bool?.filter
    ).toContainEqual({
      bool: {
        should: [
          {
            bool: { must_not: [{ exists: { field: "requested_space_ids" } }] },
          },
          {
            terms_set: {
              requested_space_ids: {
                terms: [],
                minimum_should_match_script: {
                  source: "doc['requested_space_ids'].size()",
                },
              },
            },
          },
        ],
        minimum_should_match: 1,
      },
    });
    const withoutGrants = await searchListings(auth);
    expect(withoutGrants.map((skill) => skill.sId)).toEqual([unrestricted.sId]);

    await grantWorkspacePermission(workspace, user, {
      grantType: "*",
      resourceType: "space",
    });
    await auth.refresh();
    expect(auth.getReadableSpaceModelIds()).toEqual({ kind: "all" });
    expect(
      buildSkillSearchQuery(auth, { searchTerm: "" }).bool?.filter
    ).toContainEqual({
      match_all: {},
    });
    const withAllGrants = await searchListings(auth);
    expect(withAllGrants.map((skill) => skill.sId)).toEqual([
      unrestricted.sId,
      restricted.sId,
    ]);
  });

  it("does not require a separate skill read grant", async () => {
    const {
      authenticator: auth,
      globalGroup,
      globalSpace,
    } = await createResourceTest({
      role: "admin",
    });
    const own = await SkillFactory.create(auth, {
      availability: "workspace_users",
      requestedSpaceIds: [globalSpace.id],
    });
    const other = await SkillFactory.create(auth, {
      name: "Skill without a read grant",
      requestedSpaceIds: [globalSpace.id],
      availability: "workspace_users",
      addCurrentUserAsEditor: false,
    });
    await mockHits(auth, [own, other]);
    await GroupPermissionResource.revokeTypeWide(auth, {
      group: globalGroup,
      grantType: "reader",
      resourceType: "skill",
    });
    await auth.refresh();

    const candidates = await searchListings(auth);
    expect(candidates.map((skill) => skill.sId)).toEqual([own.sId, other.sId]);
    expect(
      buildSkillSearchQuery(auth, { searchTerm: "" }).bool?.filter
    ).not.toContainEqual({
      terms: { skill_id: [own.sId] },
    });
  });

  it("requires indexed editorship even with a type-wide skill grant", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
    } = await createResourceTest({ role: "user" });
    const skill = await SkillFactory.create(auth, {
      availability: "editors",
      addCurrentUserAsEditor: false,
    });
    await grantWorkspacePermission(workspace, user, {
      grantType: "*",
      resourceType: "skill",
    });
    await auth.refresh();
    await mockHits(auth, [skill]);
    const [candidate] = await searchListings(auth);
    expect(candidate).toBeUndefined();
    expect(
      mockSearch.mock.lastCall![0].query.bool.filter[2].bool.should[1]
    ).toEqual({ term: { editor_ids: user.sId } });
    expect(
      buildSkillSearchQuery(auth, {
        searchTerm: "",
        filters: { editedByMe: true },
      }).bool?.filter
    ).toContainEqual({ term: { editor_ids: user.sId } });
  });
});
