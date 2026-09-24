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

import { GLOBAL_AGENTS_WORKSPACE_ID } from "@app/lib/agent_search/constants";
import { MAX_AGENT_SEARCH_RESULTS } from "@app/lib/agent_search/query";
import { searchAgents } from "@app/lib/api/agents/search";
import type { Authenticator } from "@app/lib/auth";
import { matchesAgentSearchFilters } from "@app/tests/utils/agent_search";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { AgentSearchDocument } from "@app/types/agent_search/agent_search";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { estypes } from "@elastic/elasticsearch";
import assert from "assert";

function makeDocument(
  overrides: Partial<AgentSearchDocument> & {
    workspace_id: string;
    agent_id: string;
  }
): AgentSearchDocument {
  return {
    status: "active",
    scope: "visible",
    model: null,
    name: overrides.agent_id,
    picture_url: "https://dust.tt/static/agent.png",
    last_edited_by_user_id: null,
    requested_space_ids: [],
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    description: "",
    skill_ids: [],
    mcp_server_view_ids: [],
    tag_ids: [],
    feedback_positive_count: 0,
    feedback_negative_count: 0,
    active_users_count: 0,
    favorite_count: 0,
    editor_ids: [],
    ...overrides,
  };
}

function mockHits(documents: AgentSearchDocument[]) {
  mockSearch.mockImplementation(async (request: estypes.SearchRequest) => ({
    hits: {
      hits: documents
        .filter((document) =>
          matchesAgentSearchFilters(document, request.query!)
        )
        .map((document) => ({
          _source: document,
          sort: [document.agent_id],
        })),
    },
  }));
}

async function searchAgentIds(
  auth: Authenticator,
  options: Partial<Parameters<typeof searchAgents>[1]> = {}
) {
  const result = await searchAgents(auth, { searchTerm: "", ...options });
  assert(result.isOk());
  return result.value.agents.map((agent) => agent.sId);
}

describe("searchAgents", () => {
  beforeEach(() => {
    mockSearch.mockReset();
  });

  it("defaults to the maximum page size and paginates on the last consumed hit", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "user",
    });
    mockHits(
      ["a", "b", "c"].map((agentId) =>
        makeDocument({ workspace_id: workspace.sId, agent_id: agentId })
      )
    );

    await searchAgents(auth, { searchTerm: "" });
    expect(mockSearch.mock.calls[0][0].size).toBe(MAX_AGENT_SEARCH_RESULTS + 1);
    expect(mockSearch.mock.calls[0][0]).not.toHaveProperty("search_after");

    const page = await searchAgents(auth, { searchTerm: "", limit: 2 });
    assert(page.isOk());
    expect(page.value.agents.map((agent) => agent.sId)).toEqual(["a", "b"]);
    expect(page.value.hasMore).toBe(true);
    assert(page.value.nextCursor);

    await searchAgents(auth, {
      searchTerm: "",
      limit: 2,
      cursor: page.value.nextCursor,
    });
    expect(mockSearch.mock.lastCall?.[0].search_after).toEqual(["b"]);
  });

  it("rejects malformed cursors without querying", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });

    const result = await searchAgents(auth, {
      searchTerm: "",
      cursor: "not-a-cursor",
    });
    assert(result.isErr());
    expect(result.error).toBe("invalid_cursor");
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it.each([
    "user",
    "manager",
  ] as const)("rejects unrestricted search for a %s without querying", async (role) => {
    const { authenticator: auth } = await createResourceTest({ role });

    const result = await searchAgents(auth, {
      searchTerm: "",
      permissionFiltering: "unrestricted",
    });
    assert(result.isErr());
    expect(result.error).toBe("unrestricted_requires_admin");
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("lets admins list every workspace agent in unrestricted mode", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const deniedSpace = await SpaceFactory.regular(workspace);
    await auth.refresh();
    mockHits([
      makeDocument({ workspace_id: workspace.sId, agent_id: "visible" }),
      makeDocument({
        workspace_id: workspace.sId,
        agent_id: "hidden",
        scope: "hidden",
      }),
      makeDocument({
        workspace_id: workspace.sId,
        agent_id: "denied-space",
        requested_space_ids: [deniedSpace.sId],
      }),
      makeDocument({
        workspace_id: workspace.sId,
        agent_id: "archived",
        status: "archived",
      }),
      makeDocument({ workspace_id: "other-workspace", agent_id: "foreign" }),
    ]);

    expect(
      await searchAgentIds(auth, { permissionFiltering: "unrestricted" })
    ).toEqual(["visible", "hidden", "denied-space"]);
    expect(await searchAgentIds(auth)).toEqual(["visible"]);
  });

  it.each([
    "user",
    "admin",
  ] as const)("applies scope, editor, space and workspace access for a %s", async (role) => {
    const {
      authenticator: auth,
      workspace,
      user,
      globalSpace,
    } = await createResourceTest({ role });
    const readableSpace = await SpaceFactory.regular(workspace);
    const members = await readableSpace.fetchManualMemberGroup(auth);
    assert(members);
    await GroupFactory.withMembers(auth, members, [user]);
    const deniedSpace = await SpaceFactory.regular(workspace);
    await auth.refresh();

    const inWorkspace = (
      agentId: string,
      overrides: Partial<AgentSearchDocument> = {}
    ) =>
      makeDocument({
        workspace_id: workspace.sId,
        agent_id: agentId,
        ...overrides,
      });
    mockHits([
      inWorkspace("visible"),
      inWorkspace("hidden", { scope: "hidden" }),
      inWorkspace("hidden-editor", {
        scope: "hidden",
        editor_ids: [user.sId],
      }),
      inWorkspace("readable-spaces", {
        requested_space_ids: [globalSpace.sId, readableSpace.sId],
      }),
      inWorkspace("denied-space", {
        requested_space_ids: [readableSpace.sId, deniedSpace.sId],
      }),
      inWorkspace("archived", { status: "archived" }),
      makeDocument({ workspace_id: "other-workspace", agent_id: "foreign" }),
      makeDocument({
        workspace_id: GLOBAL_AGENTS_WORKSPACE_ID,
        agent_id: GLOBAL_AGENTS_SID.HELPER,
        scope: "global",
      }),
      makeDocument({
        workspace_id: GLOBAL_AGENTS_WORKSPACE_ID,
        agent_id: "not-a-global-agent",
        scope: "global",
      }),
    ]);

    expect(await searchAgentIds(auth)).toEqual([
      "visible",
      "hidden-editor",
      "readable-spaces",
      GLOBAL_AGENTS_SID.HELPER,
    ]);
    expect(
      await searchAgentIds(auth, { filters: { status: ["archived"] } })
    ).toEqual(["archived"]);
    expect(
      await searchAgentIds(auth, { filters: { editedByMe: true } })
    ).toEqual(["hidden-editor"]);
  });
});
