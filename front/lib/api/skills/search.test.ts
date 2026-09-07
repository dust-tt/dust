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
import { SkillSearchDocumentResource } from "@app/lib/resources/skill/skill_search_document_resource";
import { SkillSearchCursorError } from "@app/lib/skill_search/cursor";
import {
  compareRankedSkills,
  getSkillSearchScore,
} from "@app/lib/skill_search/ranking";
import { GLOBAL_SKILL_SEARCH_ALIASES } from "@app/lib/skills/global_search_aliases";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { SkillSearchDocument } from "@app/types/skill_search/skill_search";
import type { estypes } from "@elastic/elasticsearch";
import assert from "assert";

// Only ES is mocked: the registries, Redis cursors and canonical DB/ACL checks run.
function serveDocuments(documents: SkillSearchDocument[], searchTerm = "") {
  const ordered = documents
    .map((document) => ({
      document,
      score: getSkillSearchScore({
        searchTerm,
        name: document.name,
        description: document.user_facing_description ?? "",
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

  it("rechecks pod access between pages and skips revoked candidates", async () => {
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
    assert(next.isOk());
    expect(next.value.skills.map((skill) => skill.sId)).toEqual([
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
});
