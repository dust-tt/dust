import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSearch = vi.hoisted(() => vi.fn());
const mockOpenPit = vi.hoisted(() => vi.fn());
const mockClosePit = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/elasticsearch", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/elasticsearch")>();
  return {
    ...actual,
    withEs: async (
      fn: (client: {
        search: typeof mockSearch;
        openPointInTime: typeof mockOpenPit;
        closePointInTime: typeof mockClosePit;
      }) => Promise<unknown>
    ) => {
      const { Ok } = await import("@app/types/shared/result");
      return new Ok(
        await fn({
          search: mockSearch,
          openPointInTime: mockOpenPit,
          closePointInTime: mockClosePit,
        })
      );
    },
  };
});

import { searchSkillsForCommandMenu } from "@app/lib/api/skills/search";
import { Authenticator } from "@app/lib/auth";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import { SystemSkillsRegistry } from "@app/lib/resources/skill/code_defined/system_registry";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import { SkillSearchCursorError } from "@app/lib/skill_search/cursor";
import {
  compareRankedSkills,
  getSearchRankingScore,
  getSkillSearchScore,
} from "@app/lib/skill_search/ranking";
import { storeCodeDefinedSkillActiveUsers } from "@app/lib/skill_search/usage";
import { GLOBAL_SKILL_SEARCH_ALIASES } from "@app/lib/skills/global_search_aliases";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { SearchMode } from "@app/types/api/skills";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
import type { estypes } from "@elastic/elasticsearch";
import assert from "assert";

// Only ES is mocked: the registries, Redis cursors and canonical DB/ACL checks run.
function serveDocuments(
  documents: SkillSearchDocument[],
  searchTerm = "",
  mode: SearchMode = "autocomplete"
) {
  const ordered = documents
    .map((document) => ({
      document,
      score: getSearchRankingScore({
        mode,
        activeUsers: document.active_users,
        matchScore: getSkillSearchScore({
          searchTerm,
          name: document.name,
          description: document.description ?? "",
          mode,
        }),
      }),
      name: document.name,
      sId: document.skill_id,
    }))
    .filter((hit) => hit.score > 0)
    .sort(compareRankedSkills);
  mockSearch.mockImplementation(async (request: estypes.SearchRequest) => {
    const after = request.search_after?.[3];
    const offset = typeof after === "number" ? after + 1 : 0;
    return {
      pit_id: "pit-latest",
      hits: {
        hits: ordered
          .slice(offset, offset + (request.size ?? 50))
          .map((hit, index) => ({
            _source: hit.document,
            sort: [hit.score, hit.name, hit.sId, offset + index],
          })),
      },
    };
  });
}

async function createDocument(
  auth: Authenticator,
  name: string,
  podModelId?: number
) {
  const skill = await SkillFactory.create(auth, {
    name,
    availability: "workspace_users",
    requestedSpaceIds: podModelId === undefined ? [] : [podModelId],
  });
  const document = await SkillSearchDocumentResource.fetchSearchDocument(
    auth,
    skill.sId
  );
  assert(document);
  return document;
}

async function allowedGlobals(auth: Authenticator) {
  const globals = await GlobalSkillsRegistry.findAll(auth);
  const systems = await SystemSkillsRegistry.findAll(auth);
  return [...globals, ...systems].sort(
    (a, b) =>
      Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)) ||
      Buffer.compare(Buffer.from(a.sId), Buffer.from(b.sId))
  );
}

describe("searchSkillsForCommandMenu pagination", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSearch.mockReset();
    mockOpenPit.mockReset().mockResolvedValue({ id: "pit-initial" });
    mockClosePit.mockReset().mockResolvedValue({ succeeded: true });
  });

  it("paginates one usage-ranked stream of custom and code-defined skills", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
    });
    const firstDocument = await createDocument(auth, "AAA lower usage");
    const lastDocument = await createDocument(auth, "ZZZ higher usage");
    const first = {
      ...firstDocument,
      active_users: 4,
    };
    const last = {
      ...lastDocument,
      active_users: 20,
    };
    await storeCodeDefinedSkillActiveUsers(workspace.sId, { "go-deep": 10 });
    serveDocuments([first, last], "", "management");
    let cursor: string | undefined;
    const ids: string[] = [];
    for (let pageNumber = 0; pageNumber < 3; pageNumber++) {
      const page = await searchSkillsForCommandMenu(auth, {
        searchTerm: "",
        mode: "management",
        limit: 1,
        cursor,
      });
      assert(page.isOk());
      ids.push(...page.value.skills.map((skill) => skill.sId));
      cursor = page.value.nextCursor ?? undefined;
    }
    expect(ids).toEqual([last.skill_id, "go-deep", first.skill_id]);
    expect(
      mockSearch.mock.calls[0][0].query.bool.must[0].script_score
    ).toMatchObject({ script: { source: "1 + doc['active_users'].value" } });
  });

  it("binds cursors to ranking and selection filters", async () => {
    const { auth } = await createPrivateApiMockRequest({ role: "user" });
    serveDocuments([]);
    const page = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      limit: 1,
    });
    assert(page.isOk() && page.value.nextCursor);
    for (const options of [
      { mode: "management" as const },
      { filters: { isDefault: true } },
    ]) {
      const changed = await searchSkillsForCommandMenu(auth, {
        searchTerm: "",
        cursor: page.value.nextCursor,
        ...options,
      });
      assert(changed.isErr());
      expect(changed.error).toBeInstanceOf(SkillSearchCursorError);
    }
  });

  it("applies default, availability, and editor filters to code-defined skills too", async () => {
    const { auth } = await createPrivateApiMockRequest({ role: "user" });
    serveDocuments([]);
    const defaults = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      filters: { isDefault: true },
    });
    assert(defaults.isOk());
    const globals = await GlobalSkillsRegistry.findAll(auth);
    expect(defaults.value.skills.map((skill) => skill.sId).sort()).toEqual(
      globals.map((skill) => skill.sId).sort()
    );
    const editors = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      filters: { editedByMe: true },
    });
    assert(editors.isOk());
    expect(editors.value.skills).toEqual([]);
    const unpublished = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      filters: { availability: ["editors"] },
    });
    assert(unpublished.isOk());
    expect(unpublished.value.skills).toEqual([]);
  });

  it("refetches custom hits displaced by globals without skips or duplicates", async () => {
    const { auth } = await createPrivateApiMockRequest({ role: "user" });
    const globals = await allowedGlobals(auth);
    const documents: SkillSearchDocument[] = [];
    for (const name of ["zzzz 01", "zzzz 02", "zzzz 03", "zzzz 04"]) {
      const document = await createDocument(auth, name);
      documents.push(document);
    }
    serveDocuments(documents);
    const first = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      limit: globals.length + 2,
    });
    assert(first.isOk() && first.value.nextCursor);
    expect(first.value.skills.map((skill) => skill.sId)).toEqual([
      ...globals.map((skill) => skill.sId),
      documents[0].skill_id,
      documents[1].skill_id,
    ]);
    expect(mockSearch).toHaveBeenCalledOnce();

    const second = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      limit: globals.length + 2,
      cursor: first.value.nextCursor,
    });
    assert(second.isOk());
    expect(mockSearch.mock.calls[1][0].search_after).toEqual([
      1,
      documents[1].name,
      documents[1].skill_id,
      1,
    ]);
    expect(second.value.skills.map((skill) => skill.sId)).toEqual(
      documents.slice(2).map((doc) => doc.skill_id)
    );
    expect(second.value.nextCursor).toBeNull();
    expect(mockOpenPit).toHaveBeenCalledOnce();
    expect(mockSearch.mock.calls[1][0].pit.id).toBe("pit-latest");

    // An immutable cursor can be retried without moving the global position.
    const retry = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      limit: globals.length + 2,
      cursor: first.value.nextCursor,
    });
    assert(retry.isOk());
    expect(retry.value.skills).toEqual(second.value.skills);
  });

  it("does not advance ES when a page contains only globals", async () => {
    const { auth } = await createPrivateApiMockRequest();
    const globals = await allowedGlobals(auth);
    const document = await createDocument(auth, "zzzz custom");
    serveDocuments([document]);
    const first = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      limit: 1,
    });
    assert(first.isOk() && first.value.nextCursor);
    expect(first.value.skills[0].sId).toBe(globals[0].sId);
    const second = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      limit: 1,
      cursor: first.value.nextCursor,
    });
    assert(second.isOk());
    expect(second.value.skills[0].sId).toBe(globals[1].sId);
    expect(mockSearch.mock.calls[1][0].search_after).toBeUndefined();
  });

  it("paginates remaining globals after ES is exhausted without querying ES again", async () => {
    const { auth } = await createPrivateApiMockRequest();
    const globals = await allowedGlobals(auth);
    serveDocuments([]);
    const first = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      limit: 1,
    });
    assert(first.isOk() && first.value.nextCursor);
    const second = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      limit: 150,
      cursor: first.value.nextCursor,
    });
    assert(second.isOk());
    expect(second.value.skills.map((skill) => skill.sId)).toEqual(
      globals.slice(1).map((skill) => skill.sId)
    );
    expect(second.value.nextCursor).toBeNull();
    expect(mockSearch).toHaveBeenCalledOnce();
  });

  it("paginates word-prefix matches without losing custom hits displaced by globals", async () => {
    const { auth } = await createPrivateApiMockRequest({ role: "user" });
    const exact = await createDocument(auth, "Deep");
    const prefix = await createDocument(auth, "DeepBuilder");
    const wordPrefix = await createDocument(auth, "WeeklyDeepReport");
    const notAMatch = await createDocument(
      auth,
      "DeveloperExperienceExpertPlanner"
    );
    serveDocuments([wordPrefix, notAMatch, prefix, exact], "deep");

    let cursor: string | undefined;
    const ids: string[] = [];
    for (let pageNumber = 0; pageNumber < 4; pageNumber++) {
      const page = await searchSkillsForCommandMenu(auth, {
        searchTerm: "deep",
        limit: 1,
        cursor,
      });
      assert(page.isOk());
      expect(page.value.skills).toHaveLength(1);
      ids.push(...page.value.skills.map((skill) => skill.sId));
      cursor = page.value.nextCursor ?? undefined;
    }
    expect(ids).toEqual([
      exact.skill_id,
      prefix.skill_id,
      "go-deep",
      wordPrefix.skill_id,
    ]);
    expect(cursor).toBeUndefined();
  });

  it("matches global aliases and does not return restricted globals", async () => {
    const { auth } = await createPrivateApiMockRequest({ role: "user" });
    serveDocuments([], "Deep Dive");
    const result = await searchSkillsForCommandMenu(auth, {
      searchTerm: "Deep Dive",
    });
    assert(result.isOk());
    expect(GLOBAL_SKILL_SEARCH_ALIASES["go-deep"]).toContain("Deep Dive");
    expect(result.value.skills[0]).toMatchObject({
      sId: "go-deep",
      score: 100,
    });

    serveDocuments([], "Workspace Analytics");
    const restricted = await searchSkillsForCommandMenu(auth, {
      searchTerm: "Workspace Analytics",
    });
    assert(restricted.isOk());
    expect(
      restricted.value.skills.some(
        (skill) => skill.sId === "workspace-analytics"
      )
    ).toBe(false);
  });

  it("rejects a cursor for another query, workspace, caller, or missing state", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "user",
    });
    serveDocuments([]);
    const first = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      limit: 1,
    });
    assert(first.isOk() && first.value.nextCursor);
    const other = await createPrivateApiMockRequest({ role: "user" });
    // Use a valid workspace authenticator with a different identity (internal admin).
    const internal = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    for (const [caller, searchTerm, cursor] of [
      [auth, "different query", first.value.nextCursor],
      [other.auth, "", first.value.nextCursor],
      [internal, "", first.value.nextCursor],
      [auth, "", "00000000-0000-4000-8000-000000000000"],
    ] as const) {
      const result = await searchSkillsForCommandMenu(caller, {
        searchTerm,
        cursor,
      });
      assert(result.isErr());
      expect(result.error).toBeInstanceOf(SkillSearchCursorError);
    }
    expect(mockOpenPit).toHaveBeenCalledOnce();
  });

  it("invalidates a strict cursor when pod read grants change", async () => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      role: "user",
    });
    const pod = await SpaceFactory.project(workspace, user.id);
    await auth.refresh();
    const firstDoc = await createDocument(auth, "000 custom");
    const podDoc = await createDocument(auth, "001 pod", pod.id);
    const lastDoc = await createDocument(auth, "002 custom");
    serveDocuments([firstDoc, podDoc, lastDoc]);
    const first = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      limit: 1,
    });
    assert(first.isOk() && first.value.nextCursor);
    await pod.writeGroupPermissions(auth, { members: [], editors: [] });
    await auth.refresh();
    const next = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      limit: 1,
      cursor: first.value.nextCursor,
    });
    assert(next.isErr());
    expect(next.error).toBeInstanceOf(SkillSearchCursorError);
    const restarted = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      limit: 2,
    });
    assert(restarted.isOk());
    expect(restarted.value.skills.map((skill) => skill.sId)).toEqual([
      firstDoc.skill_id,
      lastDoc.skill_id,
    ]);
  });

  it("keeps progress through a bounded run of denied hits without emitting globals early", async () => {
    const { auth } = await createPrivateApiMockRequest({ role: "user" });
    const visible = await createDocument(auth, "000 visible");
    // Duplicate stale hits simulate full candidate batches without creating 250 DB rows.
    const stale = { ...visible, skill_id: "missing-skill", name: "000 denied" };
    serveDocuments([...Array.from({ length: 250 }, () => stale), visible]);
    const first = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      limit: 1,
    });
    assert(first.isOk() && first.value.nextCursor);
    expect(first.value.skills).toEqual([]);
    expect(mockSearch).toHaveBeenCalledTimes(5);
    const second = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      limit: 1,
      cursor: first.value.nextCursor,
    });
    assert(second.isOk());
    expect(second.value.skills[0].sId).toBe(visible.skill_id);
    expect(mockSearch.mock.calls[5][0].search_after[3]).toBe(249);
    expect(mockSearch.mock.calls[5][0].query.bool.filter).toContainEqual({
      term: { workspace_id: auth.getNonNullableWorkspace().sId },
    });
  });

  it("retains admin listing metadata with canonical redaction for spaces, pods, and editors-only skills", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const restrictedPod = await SpaceFactory.project(workspace);
    const skills: SkillResource[] = [];
    for (const spaceIds of [[], [restrictedSpace.id], [restrictedPod.id]]) {
      for (const availability of ["workspace_users", "editors"] as const) {
        const skill = await SkillFactory.create(auth, {
          name: `000 redaction ${skills.length}`,
          instructions: "Secret instructions must never appear in search",
          userFacingDescription: "Listing description remains visible",
          requestedSpaceIds: spaceIds,
          availability,
          addCurrentUserAsEditor: false,
        });
        skills.push(skill);
      }
    }
    const skillIds = skills.map((skill) => skill.sId);
    const documents = await SkillSearchDocumentResource.fetchSearchDocuments(
      auth,
      skillIds
    );
    serveDocuments(documents);
    const result = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      limit: skills.length,
      permissionFiltering: "redact_unreadable",
    });
    assert(result.isOk());
    const canonical = await SkillResource.fetchByIds(auth, skillIds, {
      permissionFiltering: "redact_unreadable",
    });
    const canonicalById = new Map(
      canonical.map((skill) => [skill.sId, skill.toJSON(auth)])
    );
    expect(result.value.skills).toHaveLength(skills.length);
    for (const hit of result.value.skills) {
      const expected = canonicalById.get(hit.sId);
      assert(expected);
      expect(hit).toEqual({
        sId: expected.sId,
        name: expected.name,
        userFacingDescription: expected.userFacingDescription,
        icon: expected.icon,
        editedBy: expected.editedBy,
        requestedSpaceIds: expected.requestedSpaceIds,
        canRead: expected.canRead,
        score: 1,
      });
    }
    expect(
      result.value.skills.filter((skill) => skill.canRead === false)
    ).toHaveLength(4);
    expect(JSON.stringify(result.value)).not.toContain("Secret instructions");
    expect(mockSearch.mock.calls[0][0].query.bool.must[0].bool.filter).toEqual([
      { term: { workspace_id: workspace.sId } },
      { term: { status: "active" } },
    ]);
  });

  it.each([
    "user",
    "builder",
    "manager",
  ] as const)("refuses redaction to a %s before opening ES", async (role) => {
    const { auth } = await createPrivateApiMockRequest({ role });
    await expect(
      searchSkillsForCommandMenu(auth, {
        searchTerm: "",
        permissionFiltering: "redact_unreadable",
      })
    ).rejects.toThrow("Only admins");
    expect(mockOpenPit).not.toHaveBeenCalled();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it.each([
    "strict",
    "redact_unreadable",
  ] as const)("does not reuse a %s cursor in the other permission mode", async (permissionFiltering) => {
    const { auth } = await createPrivateApiMockRequest({ role: "admin" });
    serveDocuments([]);
    const first = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      limit: 1,
      permissionFiltering,
    });
    assert(first.isOk() && first.value.nextCursor);
    const second = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      cursor: first.value.nextCursor,
      permissionFiltering:
        permissionFiltering === "strict" ? "redact_unreadable" : "strict",
    });
    assert(second.isErr());
    expect(second.error).toBeInstanceOf(SkillSearchCursorError);
    expect(mockSearch).toHaveBeenCalledOnce();
  });

  it("redacts newly unreadable pods on the next page without dropping their metadata", async () => {
    const { auth, workspace, user } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);
    await auth.refresh();
    const firstDoc = await createDocument(auth, "000 first");
    const podDoc = await createDocument(auth, "001 pod", pod.id);
    serveDocuments([firstDoc, podDoc]);
    const first = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      limit: 1,
      permissionFiltering: "redact_unreadable",
    });
    assert(first.isOk() && first.value.nextCursor);
    expect(first.value.skills[0]).toMatchObject({
      sId: firstDoc.skill_id,
      canRead: true,
    });
    await pod.writeGroupPermissions(auth, { members: [], editors: [] });
    await auth.refresh();
    const next = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      limit: 1,
      cursor: first.value.nextCursor,
      permissionFiltering: "redact_unreadable",
    });
    assert(next.isOk());
    expect(next.value.skills).toHaveLength(1);
    expect(next.value.skills[0]).toMatchObject({
      sId: podDoc.skill_id,
      canRead: false,
    });
  });

  it("uses committed metadata and excludes archived and cross-workspace hits in redaction mode", async () => {
    const { auth } = await createPrivateApiMockRequest({ role: "admin" });
    const current = await createDocument(auth, "000 current");
    const archivedSkill = await SkillFactory.create(auth, {
      name: "001 archived",
    });
    const archived = await SkillSearchDocumentResource.fetchSearchDocument(
      auth,
      archivedSkill.sId
    );
    assert(archived);
    await archivedSkill.archive(auth);
    const other = await createPrivateApiMockRequest({ role: "admin" });
    const foreign = await createDocument(other.auth, "002 foreign");
    serveDocuments([
      {
        ...current,
        description: "Stale description",
        instructions: "Never return this",
      },
      archived,
      foreign,
    ]);
    const result = await searchSkillsForCommandMenu(auth, {
      searchTerm: "",
      limit: 50,
      permissionFiltering: "redact_unreadable",
    });
    assert(result.isOk());
    const custom = result.value.skills.filter((skill) =>
      skill.sId.startsWith("skl_")
    );
    expect(custom).toEqual([
      SkillResource.fromSearchDocument(auth, current, {
        canRead: true,
      }).toSearchJSON(auth, 1),
    ]);
    expect(JSON.stringify(result.value)).not.toContain("Never return this");
  });
});
