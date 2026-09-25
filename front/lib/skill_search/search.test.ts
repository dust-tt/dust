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
import { Authenticator } from "@app/lib/auth";
import { GroupPermissionResource } from "@app/lib/resources/group_permission_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { buildSkillSearchQuery } from "@app/lib/skill_search/query";
import { toSkillListItem } from "@app/lib/skill_search/serialization";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { matchesSkillSearchFilters } from "@app/tests/utils/skill_search";
import type {
  SkillSearchFilters,
  SkillSearchPermissionFiltering,
} from "@app/types/api/skills";
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
  return documents;
}

async function searchListings(
  auth: Authenticator,
  options: {
    searchTerm: string;
    filters?: SkillSearchFilters;
    permissionFiltering?: SkillSearchPermissionFiltering;
  } = { searchTerm: "" }
) {
  const result = await searchSkills(auth, {
    ...options,
    limit: 200,
  });
  assert(result.isOk());
  return result.value.skills;
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
    const query = buildSkillSearchQuery(auth, { searchTerm: "  report b  " });
    expect(query).toEqual({
      bool: {
        must: [
          {
            multi_match: {
              query: "report b",
              type: "bool_prefix",
              operator: "and",
              fields: [
                "name.keyword",
                "name.autocomplete",
                "name.autocomplete._2gram",
                "name.autocomplete_preserved",
                "name.autocomplete_preserved._2gram",
              ],
            },
          },
        ],
        filter: [{ terms: { status: ["active"] } }],
        should: [
          {
            bool: {
              filter: [
                { term: { workspace_id: workspace.sId } },
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
            },
          },
          {
            bool: {
              filter: [
                { term: { workspace_id: "global" } },
                { terms: { skill_id: [] } },
              ],
            },
          },
        ],
        minimum_should_match: 1,
      },
    });
    expect(
      SkillFactory.createCodeDefinedSearchDocuments().filter((document) =>
        matchesSkillSearchFilters(document, query)
      )
    ).toEqual([]);
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
      { terms: { mcp_server_view_ids: ["view-2", "view-1", "view-2"] } },
      { terms: { availability: ["users_and_agents"] } },
      ...(editedByMe ? [editor] : []),
    ]);
    expect(query.bool?.should).toEqual(base.bool?.should);
  });

  it.each(
    (["user", "manager", "admin"] as const).flatMap((role) =>
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
    // Bounded matrix: 5 space cases × 3 pod cases × 3 availabilities × 2 editor states.
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
    const { query } = mockSearch.mock.lastCall![0];
    const filters = query.bool.should[0].bool.filter;
    const terms = filters.at(-1).terms_set.requested_space_ids.terms;
    expect(terms).toEqual(
      expect.arrayContaining([
        readableSpace.sId,
        extraSpace.sId,
        readablePod.sId,
      ])
    );
    expect(terms).not.toContain(deniedSpace.sId);
    expect(terms).not.toContain(deniedPod.sId);
    expect(filters).toHaveLength(3);
    expect(filters[1].bool.should[1]).toEqual({
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
      // Skill fields are eventually consistent until the document is refreshed or deleted, but
      // `canAdministrate` is derived from live grants and reflects the change immediately.
      const { canAdministrate: beforeCanAdministrate, ...beforeRest } = before;
      const { canAdministrate: afterCanAdministrate, ...afterRest } = after;
      expect(afterRest).toEqual(beforeRest);
      expect(afterCanAdministrate).toBe(
        change === "archive" ? beforeCanAdministrate : false
      );
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
    const hits = [
      { _source: documents[0] },
      { _id: "missing-skill" },
      { _source: documents[1] },
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

    expect(await searchListings(auth)).toEqual(expected);

    const page = await searchSkills(auth, {
      searchTerm: "",
      limit: 2,
    });
    assert(page.isOk());
    expect(page.value).toEqual({
      skills: [expected[0]],
      total: 3,
      hasMore: true,
      facets: {},
    });
  });

  it("projects indexed listing metadata without database reads after search", async () => {
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
    const search = mockSearch.getMockImplementation();
    assert(search);
    mockSearch.mockImplementationOnce(async (request) => {
      const response = await search(request);
      frontSequelize.addHook("afterQuery", "skill-search-no-db", onQuery);
      return response;
    });
    try {
      const both = await searchListings(auth, {
        searchTerm: "",
        filters: { status: ["active", "archived"] },
      });
      expect(both.map((skill) => skill.sId)).toEqual([
        active.sId,
        archived.sId,
      ]);
      const listing = both[0];
      expect(
        SkillListItemSchema.omit({ editors: true }).strict().parse(listing)
      ).toEqual({
        sId: active.sId,
        canAdministrate: true,
        status: "active",
        name: "Indexed name",
        userFacingDescription: "Indexed description",
        icon: active.icon,
        requestedSpaceIds: [globalSpace.sId],
        mcpServerViewIds: ["tool-view-id"],
        editorIds: [auth.getNonNullableUser().sId],
        editedBy: auth.getNonNullableUser().sId,
        availability: "workspace_users",
        activeUsersCount: null,
        updatedAt: active.updatedAt.getTime(),
      });
      expect(SkillSchema.safeParse(listing).success).toBe(false);
      expect(mockSearch.mock.lastCall![0]).toMatchObject({
        index: "front.skills",
        _source: true,
      });
      expect(mockSearch.mock.lastCall![0].query.bool.filter).toEqual(
        buildSkillSearchQuery(auth, {
          searchTerm: "",
          filters: { status: ["active", "archived"] },
        }).bool?.filter
      );
      expect(onQuery).not.toHaveBeenCalled();
    } finally {
      frontSequelize.removeHook("afterQuery", "skill-search-no-db");
    }
  });

  it("projects eligible global documents without database reads after search", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    const documents = SkillFactory.createCodeDefinedSearchDocuments();
    const global = documents.find(
      (document) => document.skill_id === "go-deep"
    );
    assert(global);
    await mockHits(auth, [], [global]);
    const onQuery = vi.fn();
    const search = mockSearch.getMockImplementation();
    assert(search);
    mockSearch.mockImplementationOnce(async (request) => {
      const response = await search(request);
      frontSequelize.addHook(
        "afterQuery",
        "global-skill-search-no-db",
        onQuery
      );
      return response;
    });
    try {
      const result = await searchSkills(auth, {
        searchTerm: "",
        limit: 200,
      });
      assert(result.isOk());
      const listings = result.value.skills;
      expect(listings).toEqual([
        {
          ...toSkillListItem(auth, global),
          canAdministrate: false,
          editedBy: null,
          updatedAt: null,
        },
      ]);
      expect(
        SkillListItemSchema.omit({ editors: true }).parse(listings[0]).updatedAt
      ).toBeNull();
      expect(onQuery).not.toHaveBeenCalled();
    } finally {
      frontSequelize.removeHook("afterQuery", "global-skill-search-no-db");
    }
  });

  it.each([
    "regular",
    "project",
  ] as const)("returns unreadable %s listings for admins without hydration", async (kind) => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const space =
      kind === "regular"
        ? await SpaceFactory.regular(workspace)
        : await SpaceFactory.project(workspace);
    const skill = await SkillFactory.create(auth, {
      requestedSpaceIds: [space.id],
      manuallyRequestedSpaceIds: [space.id],
    });
    const [document] = await mockHits(auth, [skill]);
    const [strict] = await searchListings(auth);
    expect(strict).toBeUndefined();
    const [redacted] = await searchListings(auth, {
      searchTerm: "",
      permissionFiltering: "redact_unreadable",
    });
    expect(
      SkillListItemSchema.omit({ editors: true }).strict().parse(redacted)
    ).toEqual(toSkillListItem(auth, document));
    expect(
      mockSearch.mock.lastCall![0].query.bool.should[0].bool.filter
    ).toEqual([{ term: { workspace_id: workspace.sId } }]);
  });

  it("handles absent and type-wide space grants without enumerating spaces", async () => {
    const {
      authenticator: auth,
      workspace,
      user,
      globalSpace,
      conversationsSpace,
    } = await createResourceTest({ role: "user" });
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
      [buildSkillSearchQuery(auth, { searchTerm: "" }).bool?.should].flat()[0]
        ?.bool?.filter
    ).toContainEqual({
      terms_set: {
        requested_space_ids: {
          terms: [],
          minimum_should_match_script: {
            source: "doc['requested_space_ids'].size()",
          },
        },
      },
    });

    await grantWorkspacePermission(workspace, user, {
      grantType: "*",
      resourceType: "space",
    });
    await auth.refresh();
    expect(auth.getReadableSpaceModelIds()).toEqual({ kind: "all" });
    expect(
      [buildSkillSearchQuery(auth, { searchTerm: "" }).bool?.should].flat()[0]
        ?.bool?.filter
    ).toContainEqual({
      match_all: {},
    });
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
    const redacted = await searchListings(auth, {
      searchTerm: "",
      permissionFiltering: "redact_unreadable",
    });
    expect(redacted).toEqual(candidates);
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
      mockSearch.mock.lastCall![0].query.bool.should[0].bool.filter[1].bool
        .should[1]
    ).toEqual({ term: { editor_ids: user.sId } });
    expect(
      buildSkillSearchQuery(auth, {
        searchTerm: "",
        filters: { editedByMe: true },
      }).bool?.filter
    ).toContainEqual({ term: { editor_ids: user.sId } });
  });

  it.each([
    0, 1, 2, 3,
  ])("returns page metadata from the exact total at offset %s", async (offset) => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    const skills: SkillResource[] = [];
    for (const name of ["ÉclairBot", "ReportBot", "WeatherBot"]) {
      const skill = await SkillFactory.create(auth, { name });
      skills.push(skill);
    }
    const documents = await SkillFactory.createSearchDocuments(auth, skills);
    mockSearch.mockImplementation(async (request: estypes.SearchRequest) => ({
      hits: {
        hits: documents
          .slice(request.from ?? 0, (request.from ?? 0) + (request.size ?? 0))
          .map((document) => ({ _source: document })),
        total: { value: documents.length, relation: "eq" },
      },
    }));

    const result = await searchSkills(auth, {
      searchTerm: "",
      offset,
      limit: 2,
    });
    assert(result.isOk());

    const pageDocuments = documents.slice(offset, offset + 2);
    expect(result.value).toEqual({
      skills: pageDocuments.map((document) => toSkillListItem(auth, document)),
      total: documents.length,
      hasMore: offset + pageDocuments.length < documents.length,
      facets: {},
    });
    expect(mockSearch).toHaveBeenCalledOnce();
    expect(mockSearch.mock.lastCall![0]).toMatchObject({
      from: offset,
      size: 2,
      track_total_hits: true,
      sort: [
        { _score: { order: "desc" } },
        { active_users_count: { order: "desc", missing: "_last" } },
        { skill_id: { order: "asc" } },
      ],
    });
    expect(mockSearch.mock.lastCall![0]).not.toHaveProperty("search_after");
  });
});
