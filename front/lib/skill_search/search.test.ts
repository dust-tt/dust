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
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import {
  prepareSkillSearchQuery,
  searchSkillDocumentCandidates,
} from "@app/lib/skill_search/search";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { grantWorkspacePermission } from "@app/tests/utils/permissions";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { SkillSearchOptions } from "@app/types/api/skills";
import {
  SkillListItemSchema,
  SkillSchema,
} from "@app/types/assistant/skill_configuration";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration_constants";
import { removeNulls } from "@app/types/shared/utils/general";
import assert from "assert";
import { z } from "zod";

function mockHits(skills: SkillResource[]) {
  mockSearch.mockResolvedValue({
    hits: {
      hits: skills.map((skill) => ({ sort: [1, skill.name, skill.sId] })),
    },
  });
}

async function searchCandidates(
  auth: Authenticator,
  options: SkillSearchOptions = { searchTerm: "" }
) {
  const result = await searchSkillDocumentCandidates(auth, {
    query: prepareSkillSearchQuery(
      auth,
      options.searchTerm,
      options.permissionFiltering,
      options
    ),
    searchAfter: null,
    limit: 200,
    permissionFiltering: options.permissionFiltering,
    status: options.filters?.status,
  });
  assert(result.isOk());
  return result.value.candidates;
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
    const query = prepareSkillSearchQuery(auth, "report b");
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
                {
                  bool: {
                    filter: [
                      { term: { availability: "editors" } },
                      { term: { editor_ids: auth.getNonNullableUser().sId } },
                    ],
                  },
                },
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

  it.each([
    true,
    false,
  ])("adds selection filters without replacing ACLs (isDefault=%s)", async (isDefault) => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    const base = prepareSkillSearchQuery(auth, "");
    const query = prepareSkillSearchQuery(auth, "", "strict", {
      filters: {
        toolIds: ["view-2", "view-1", "view-2"],
        spaceIds: ["space-1"],
        availability: ["users_and_agents"],
        editedByMe: isDefault,
        isDefault,
      },
    });
    const editor = { term: { editor_ids: auth.getNonNullableUser().sId } };
    const defaultFilter = { term: { availability: "users_and_agents" } };
    expect(query.bool?.filter).toEqual(
      expect.arrayContaining([
        ...[base.bool?.filter].flat(),
        { terms: { mcp_server_view_ids: ["view-1", "view-2"] } },
        { terms: { requested_space_ids: ["space-1"] } },
        { terms: { availability: ["users_and_agents"] } },
        isDefault ? editor : { bool: { must_not: [editor] } },
        isDefault ? defaultFilter : { bool: { must_not: [defaultFilter] } },
      ])
    );
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
  )("enforces every space/pod/availability/editor combination for $label / $status", async ({
    role,
    keyFactory,
    status,
  }) => {
    const {
      authenticator: authorAuth,
      workspace,
      user,
      globalGroup,
    } = await createResourceTest({ role });
    const readableSpace = await SpaceFactory.regular(workspace);
    const readablePod = await SpaceFactory.project(workspace);
    const spaceMembers = await readableSpace.fetchManualMemberGroup(authorAuth);
    const podMembers = await readablePod.fetchManualMemberGroup(authorAuth);
    assert(spaceMembers && podMembers);
    await GroupFactory.withMembers(authorAuth, spaceMembers, [user]);
    await GroupFactory.withMembers(authorAuth, podMembers, [user]);
    const deniedSpace = await SpaceFactory.regular(workspace);
    const deniedPod = await SpaceFactory.project(workspace);
    const extraSpace = await SpaceFactory.regular(workspace);
    await SpaceFactory.attachGroup(extraSpace, globalGroup);
    const spaceCases = [
      { spaces: [], readable: true },
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
            const skill = await SkillFactory.create(authorAuth, {
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
              (availability !== "editors" || isEditor || keyFactory)
            ) {
              expectedIds.push(skill.sId);
            }
          }
        }
      }
    }
    const key = keyFactory
      ? await keyFactory([globalGroup, spaceMembers, podMembers])
      : null;
    const auth = key
      ? await Authenticator.fromKey(key, workspace.sId)
      : authorAuth;
    await auth.refresh();
    // Include denied hits too: stale ES candidates must never bypass the live resource ACL.
    mockHits(skills);
    const candidates = await searchCandidates(auth, {
      searchTerm: "",
      filters: { status: [status] },
    });
    expect(
      removeNulls(candidates.map(({ skill }) => skill?.sId ?? null))
    ).toEqual(expectedIds);
    expect(candidates).toHaveLength(skills.length);
    expect(mockSearch).toHaveBeenCalledOnce();
    const filters = mockSearch.mock.lastCall![0].query.bool.must[0].bool.filter;
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
    expect(filters).toHaveLength(key ? 3 : 4);
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
    mockHits([skill]);
    const [candidate] = await searchCandidates(auth);
    expect(candidate.skill?.sId ?? null).toBe(
      access === "denied" ? null : skill.sId
    );
  });

  it.each([
    "pod",
    "editor",
    "availability",
    "archive",
    "delete",
  ] as const)("rechecks a stale hit after a change to %s", async (change) => {
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
    mockHits([skill]);
    const [before] = await searchCandidates(auth);
    expect(before.skill?.sId).toBe(skill.sId);
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
    const [after] = await searchCandidates(auth);
    expect(after.skill).toBeNull();
    expect(after.sort).toEqual(before.sort);
  });

  it("uses current listing metadata and filters foreign, suggested and unrequested statuses", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const other = await createResourceTest({ role: "admin" });
    const active = await SkillFactory.create(auth, {
      availability: "workspace_users",
      instructions: "Private instructions",
    });
    const archived = await SkillFactory.create(auth, { status: "archived" });
    const suggested = await SkillFactory.create(auth, { status: "suggested" });
    const foreign = await SkillFactory.create(other.authenticator);
    mockHits([active, archived, suggested, foreign]);
    const defaults = await searchCandidates(auth);
    expect(defaults.map(({ skill }) => skill?.sId ?? null)).toEqual([
      active.sId,
      null,
      null,
      null,
    ]);
    const both = await searchCandidates(auth, {
      searchTerm: "",
      filters: { status: ["active", "archived"] },
    });
    expect(both.map(({ skill }) => skill?.sId ?? null)).toEqual([
      active.sId,
      archived.sId,
      null,
      null,
    ]);
    const listing = both[0].skill;
    expect(
      SkillListItemSchema.extend({ score: z.number() }).strict().parse(listing)
    ).toEqual(active.toSearchJSON(auth, 1));
    expect(SkillSchema.safeParse(listing).success).toBe(false);
    expect(mockSearch.mock.lastCall![0]).toMatchObject({
      index: "front.skills",
      _source: false,
      query: {
        bool: {
          filter: [
            { term: { workspace_id: auth.getNonNullableWorkspace().sId } },
          ],
        },
      },
    });
  });

  it.each([
    "regular",
    "project",
  ] as const)("uses canonical admin redaction for an unreadable %s space", async (kind) => {
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
    mockHits([skill]);
    const [strict] = await searchCandidates(auth);
    expect(strict.skill).toBeNull();
    const [redacted] = await searchCandidates(auth, {
      searchTerm: "",
      permissionFiltering: "redact_unreadable",
    });
    const canonical = await SkillResource.fetchById(auth, skill.sId, {
      permissionFiltering: "redact_unreadable",
    });
    assert(canonical);
    expect(redacted.skill).toEqual(canonical.toSearchJSON(auth, 1));
    expect(redacted.skill?.canRead).toBe(false);
    expect(mockSearch.mock.lastCall![0].query.bool.must[0].bool.filter).toEqual(
      [
        { term: { workspace_id: workspace.sId } },
        { terms: { status: ["active"] } },
      ]
    );
  });

  it.each([
    "user",
    "builder",
    "manager",
  ] as const)("refuses admin redaction for a %s", async (role) => {
    const { authenticator: auth } = await createResourceTest({ role });
    await expect(
      searchCandidates(auth, {
        searchTerm: "",
        permissionFiltering: "redact_unreadable",
      })
    ).rejects.toThrow("Only admins");
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("handles absent and type-wide space grants without enumerating spaces", async () => {
    const { workspace, globalGroup } = await createResourceTest({
      role: "admin",
    });
    const emptyGroup = await GroupFactory.regularManual(workspace, "No grants");
    const restrictedKey = await KeyFactory.readOnly(emptyGroup);
    const systemKey = await KeyFactory.system(globalGroup);
    const restricted = await Authenticator.fromKey(
      restrictedKey,
      workspace.sId
    );
    const system = await Authenticator.fromKey(systemKey, workspace.sId);
    expect(prepareSkillSearchQuery(restricted, "").bool?.filter).toEqual([
      { term: { workspace_id: workspace.sId } },
      { terms: { status: ["active"] } },
      { bool: { must_not: [{ exists: { field: "requested_space_ids" } }] } },
    ]);
    expect(prepareSkillSearchQuery(system, "").bool?.filter).toEqual([
      { term: { workspace_id: workspace.sId } },
      { terms: { status: ["active"] } },
      { match_all: {} },
    ]);
  });

  it("honors type-wide skill editorship", async () => {
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
    mockHits([skill]);
    const [candidate] = await searchCandidates(auth);
    expect(candidate.skill?.sId).toBe(skill.sId);
    expect(
      mockSearch.mock.lastCall![0].query.bool.must[0].bool.filter[2].bool
        .should[1].bool.filter[1]
    ).toEqual({ match_all: {} });
  });

  it.each([
    { timed_out: true, hits: { hits: [] } },
    { hits: { hits: [{ sort: [1, "missing skill ID"] }] } },
  ])("does not return partial or unpageable ES results", async (response) => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    mockSearch.mockResolvedValue(response);
    const result = await searchSkillDocumentCandidates(auth, {
      query: prepareSkillSearchQuery(auth, ""),
      searchAfter: null,
      limit: 10,
    });
    expect(result.isErr()).toBe(true);
  });
});
