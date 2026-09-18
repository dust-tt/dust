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

import type { Authenticator } from "@app/lib/auth";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { buildSkillSearchQuery } from "@app/lib/skill_search/query";
import { searchSkills } from "@app/lib/skill_search/search";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { matchesSkillSearchFilters } from "@app/tests/utils/skill_search";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration_constants";
import { removeNulls } from "@app/types/shared/utils/general";
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

describe("custom skill search permissions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns workspace-scoped indexed documents without database queries", async () => {
    const { authenticator: auth, globalSpace } = await createResourceTest({
      role: "user",
    });
    const other = await createResourceTest({ role: "user" });
    const skill = await SkillFactory.create(auth, {
      requestedSpaceIds: [globalSpace.id],
    });
    const foreign = await SkillFactory.create(other.authenticator, {
      requestedSpaceIds: [other.globalSpace.id],
    });
    const foreignDocuments = await SkillFactory.createSearchDocuments(
      other.authenticator,
      [foreign]
    );
    const documents = await mockHits(auth, [skill], foreignDocuments);
    const onQuery = vi.fn();
    frontSequelize.addHook("afterQuery", "skill-search-no-db", onQuery);
    try {
      const result = await searchSkills(auth, { limit: 10 });
      assert(result.isOk());
      expect(result.value.hits.hits.map((hit) => hit._source)).toEqual([
        documents[0],
      ]);
      expect(mockSearch).toHaveBeenCalledWith({
        index: "front.skills",
        query: buildSkillSearchQuery(auth),
        size: 10,
      });
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
    const base = buildSkillSearchQuery(auth);
    const query = buildSkillSearchQuery(auth, {
      filters: {
        toolIds: ["view-2", "view-1", "view-2"],
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

  it("defaults to active skills and allows selecting archived skills", async () => {
    const { authenticator: auth, globalSpace } = await createResourceTest({
      role: "user",
    });
    const active = await SkillFactory.create(auth, {
      requestedSpaceIds: [globalSpace.id],
    });
    const archived = await SkillFactory.create(auth, {
      status: "archived",
      requestedSpaceIds: [globalSpace.id],
    });
    await mockHits(auth, [active, archived]);

    const defaults = await searchSkills(auth, { limit: 10 });
    assert(defaults.isOk());
    expect(
      defaults.value.hits.hits.map((hit) => hit._source?.skill_id)
    ).toEqual([active.sId]);

    const both = await searchSkills(auth, {
      limit: 10,
      filters: { status: ["active", "archived"] },
    });
    assert(both.isOk());
    expect(both.value.hits.hits.map((hit) => hit._source?.skill_id)).toEqual([
      active.sId,
      archived.sId,
    ]);
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
    const result = await searchSkills(auth, {
      limit: 200,
      filters: { status: [status] },
    });
    assert(result.isOk());
    const { hits } = result.value.hits;
    expect(
      removeNulls(hits.map(({ _source }) => _source?.skill_id ?? null))
    ).toEqual(expectedIds);
    expect(hits).toHaveLength(expectedIds.length);
    expect(mockSearch).toHaveBeenCalledOnce();
    const filters = mockSearch.mock.lastCall![0].query.bool.filter;
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
    expect(filters).toHaveLength(4);
    expect(filters[2].bool.should[1]).toEqual({
      term: { editor_ids: user.sId },
    });
  }, 30_000);

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
    expect(buildSkillSearchQuery(auth).bool?.filter).toContainEqual({
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
    expect(buildSkillSearchQuery(auth).bool?.filter).toContainEqual({
      match_all: {},
    });
  });
});
