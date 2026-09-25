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
import {
  MAX_AGENT_SEARCH_RESULTS,
  MAX_AGENT_SEARCH_WINDOW,
} from "@app/lib/agent_search/query";
import { buildAgentNameAutocompleteQuery } from "@app/lib/agent_search/ranking";
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
  mockSearch.mockImplementation(async (request: estypes.SearchRequest) => {
    const matching = documents.filter((document) =>
      matchesAgentSearchFilters(document, request.query!)
    );
    const from = request.from ?? 0;
    return {
      hits: {
        total: { value: matching.length, relation: "eq" },
        hits: matching
          .slice(from, from + (request.size ?? matching.length))
          .map((document) => ({ _source: document })),
      },
    };
  });
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

  it("defaults to the maximum page size and paginates by offset with the exact total", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "user",
    });
    mockHits(
      ["a", "b", "c"].map((agentId) =>
        makeDocument({ workspace_id: workspace.sId, agent_id: agentId })
      )
    );

    await searchAgents(auth, { searchTerm: "" });
    expect(mockSearch.mock.calls[0][0]).toMatchObject({
      from: 0,
      size: MAX_AGENT_SEARCH_RESULTS,
      track_total_hits: true,
    });

    const firstPage = await searchAgents(auth, { searchTerm: "", limit: 2 });
    assert(firstPage.isOk());
    expect(firstPage.value).toMatchObject({ total: 3, hasMore: true });
    expect(firstPage.value.agents.map((agent) => agent.sId)).toEqual([
      "a",
      "b",
    ]);

    const lastPage = await searchAgents(auth, {
      searchTerm: "",
      limit: 2,
      offset: 2,
    });
    assert(lastPage.isOk());
    expect(lastPage.value).toMatchObject({ total: 3, hasMore: false });
    expect(lastPage.value.agents.map((agent) => agent.sId)).toEqual(["c"]);
    expect(mockSearch.mock.lastCall?.[0]).toMatchObject({ from: 2, size: 2 });
  });

  it("requires every search term to prefix-match the name, in any order", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    mockSearch.mockResolvedValue({ hits: { hits: [] } });

    await searchAgents(auth, { searchTerm: "  sal   mar " });

    const nameQuery = buildAgentNameAutocompleteQuery("sal mar");
    expect(mockSearch.mock.calls[0][0].query.bool.must).toEqual([nameQuery]);
    expect(nameQuery.bool?.must).toEqual(
      ["sal", "mar"].map((term) => ({
        multi_match: expect.objectContaining({
          query: term,
          type: "bool_prefix",
          operator: "and",
        }),
      }))
    );
    expect(buildAgentNameAutocompleteQuery("   ")).toEqual({ match_all: {} });
  });

  it("filters on editors and models and requests facet values without counts", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "user",
    });
    const model = {
      provider_id: "anthropic" as const,
      model_id: "claude-sonnet-5" as const,
      reasoning_effort: "medium" as const,
    };
    mockHits([
      makeDocument({
        workspace_id: workspace.sId,
        agent_id: "sonnet-by-alice",
        model,
        editor_ids: ["alice"],
      }),
      makeDocument({
        workspace_id: workspace.sId,
        agent_id: "sonnet-by-bob",
        model,
        editor_ids: ["bob"],
      }),
      makeDocument({ workspace_id: workspace.sId, agent_id: "no-model" }),
    ]);

    expect(
      await searchAgentIds(auth, {
        filters: { modelIds: ["claude-sonnet-5"], editorIds: ["alice"] },
      })
    ).toEqual(["sonnet-by-alice"]);

    mockSearch.mockResolvedValueOnce({
      hits: { total: { value: 2, relation: "eq" }, hits: [] },
      aggregations: {
        editors: { buckets: [{ key: "alice" }, { key: "bob" }] },
        models: { buckets: [{ key: "claude-sonnet-5" }] },
      },
    });
    const result = await searchAgents(auth, {
      searchTerm: "",
      limit: 0,
      facets: ["editors", "models"],
    });
    assert(result.isOk());
    expect(result.value.facets).toEqual({
      editors: ["alice", "bob"],
      models: ["claude-sonnet-5"],
    });
    expect(mockSearch.mock.lastCall?.[0]).toMatchObject({
      size: 0,
      aggs: {
        editors: { terms: { field: "editor_ids" } },
        models: { terms: { field: "model.model_id" } },
      },
    });
    expect(mockSearch.mock.lastCall?.[0].aggs).not.toHaveProperty("tags");
  });

  it("rejects offsets past the result window without querying", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });

    const result = await searchAgents(auth, {
      searchTerm: "",
      limit: 25,
      offset: MAX_AGENT_SEARCH_WINDOW - 24,
    });
    assert(result.isErr());
    expect(result.error).toBe("offset_out_of_range");
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
    expect(
      await searchAgentIds(auth, { filters: { scope: ["global"] } })
    ).toEqual([GLOBAL_AGENTS_SID.HELPER]);
    expect(
      await searchAgentIds(auth, { filters: { scope: ["visible", "hidden"] } })
    ).toEqual(["visible", "hidden-editor", "readable-spaces"]);
  });
});
