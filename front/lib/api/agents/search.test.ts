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
import { resolveAgentIdByName, searchAgents } from "@app/lib/api/agents/search";
import { upsertGlobalAgentSettings } from "@app/lib/api/assistant/global_agents/global_agents";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import {
  buildNameAutocompleteQuery,
  buildNameSearchQuery,
} from "@app/lib/search/agent_and_skill_queries";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { setupAgentOwner } from "@app/tests/utils/AgentOwnerFactory";
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

    const nameQuery = buildNameAutocompleteQuery("  sal   mar ");
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
    expect(buildNameAutocompleteQuery("   ")).toEqual({ match_all: {} });
  });

  it("uses name matching with the same permissions as autocomplete", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    mockSearch.mockResolvedValue({ hits: { hits: [] } });
    await searchAgents(auth, { searchTerm: "Write", searchType: "name" });
    const nameQuery = mockSearch.mock.lastCall![0].query;
    expect(nameQuery.bool.must).toEqual([buildNameSearchQuery("Write")]);

    await searchAgents(auth, { searchTerm: "Write" });
    const autocompleteQuery = mockSearch.mock.lastCall![0].query;
    expect(autocompleteQuery.bool.must).toEqual([
      buildNameAutocompleteQuery("Write"),
    ]);
    expect(nameQuery.bool.filter).toEqual(autocompleteQuery.bool.filter);
    expect(nameQuery.bool.should).toEqual(autocompleteQuery.bool.should);
  });

  it("filters on editors and models and returns facet values with counts", async () => {
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
        editors: {
          buckets: [
            { key: "alice", doc_count: 1 },
            { key: "bob", doc_count: 1 },
          ],
        },
        models: { buckets: [{ key: "claude-sonnet-5", doc_count: 2 }] },
        mcpServerViews: { buckets: [{ key: "tool-view", doc_count: 2 }] },
      },
    });
    const result = await searchAgents(auth, {
      searchTerm: "",
      limit: 0,
      facets: ["editors", "models", "mcpServerViews"],
    });
    assert(result.isOk());
    expect(result.value.facets).toEqual({
      editors: [
        { value: "alice", count: 1 },
        { value: "bob", count: 1 },
      ],
      models: [{ value: "claude-sonnet-5", count: 2 }],
      mcpServerViews: [{ value: "tool-view", count: 2 }],
    });
    expect(mockSearch.mock.lastCall?.[0]).toMatchObject({
      size: 0,
      aggs: {
        editors: { terms: { field: "editor_ids" } },
        models: { terms: { field: "model.model_id" } },
        mcpServerViews: { terms: { field: "mcp_server_view_ids" } },
      },
    });
    expect(mockSearch.mock.lastCall?.[0].aggs).not.toHaveProperty("tags");
  });

  it("filters on usage and spaces and returns the usage range", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    mockHits([
      makeDocument({
        workspace_id: workspace.sId,
        agent_id: "busy",
        active_users_count: 40,
        requested_space_ids: [],
      }),
      makeDocument({
        workspace_id: workspace.sId,
        agent_id: "quiet",
        active_users_count: 2,
      }),
      makeDocument({
        workspace_id: GLOBAL_AGENTS_WORKSPACE_ID,
        agent_id: GLOBAL_AGENTS_SID.HELPER,
        scope: "global",
        active_users_count: null,
      }),
    ]);

    expect(
      await searchAgentIds(auth, {
        filters: { activeUsersCount: { min: 10 } },
      })
    ).toEqual(["busy"]);
    expect(
      await searchAgentIds(auth, {
        filters: { activeUsersCount: { min: 0, max: 5 } },
      })
    ).toEqual(["quiet"]);
    expect(mockSearch.mock.lastCall?.[0].query.bool.filter).toContainEqual({
      range: { active_users_count: { gte: 0, lte: 5 } },
    });

    await searchAgentIds(auth, { filters: { spaceIds: ["space-a"] } });
    expect(mockSearch.mock.lastCall?.[0].query.bool.filter).toContainEqual({
      terms: { requested_space_ids: ["space-a"] },
    });

    mockSearch.mockResolvedValueOnce({
      hits: { total: { value: 2, relation: "eq" }, hits: [] },
      aggregations: { usage: { count: 2, min: 2, max: 40 } },
    });
    const result = await searchAgents(auth, {
      searchTerm: "",
      limit: 0,
      facets: ["usage", "spaces"],
    });
    assert(result.isOk());
    expect(result.value.facets).toEqual({
      usage: { min: 2, max: 40 },
      spaces: [],
    });
    expect(mockSearch.mock.lastCall?.[0].aggs).toEqual({
      usage: { stats: { field: "active_users_count" } },
      spaces: {
        terms: { field: "requested_space_ids", size: 1000 },
      },
    });
  });

  it("reports the workspace model of default agents, indexed without one", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    mockHits([
      makeDocument({
        workspace_id: GLOBAL_AGENTS_WORKSPACE_ID,
        agent_id: GLOBAL_AGENTS_SID.HELPER,
        scope: "global",
        model: null,
      }),
    ]);

    const result = await searchAgents(auth, { searchTerm: "" });
    assert(result.isOk());
    const [helper] = result.value.agents;
    expect(helper.sId).toBe(GLOBAL_AGENTS_SID.HELPER);
    expect(helper.model).toEqual({
      providerId: expect.any(String),
      modelId: expect.any(String),
      reasoningEffort: expect.any(String),
    });
  });

  it("includes disabled defaults only in global-only searches, with their workspace status", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    await upsertGlobalAgentSettings(auth, {
      agentId: GLOBAL_AGENTS_SID.DUST,
      status: "disabled_by_admin",
    });
    mockHits([
      makeDocument({ workspace_id: workspace.sId, agent_id: "custom" }),
      makeDocument({
        workspace_id: GLOBAL_AGENTS_WORKSPACE_ID,
        agent_id: GLOBAL_AGENTS_SID.DUST,
        scope: "global",
      }),
      makeDocument({
        workspace_id: GLOBAL_AGENTS_WORKSPACE_ID,
        agent_id: "not-a-global-agent",
        scope: "global",
      }),
    ]);

    expect(await searchAgentIds(auth)).toEqual(["custom"]);
    expect(
      await searchAgentIds(auth, { filters: { scope: ["global", "visible"] } })
    ).toEqual(["custom"]);

    const result = await searchAgents(auth, {
      searchTerm: "",
      filters: { scope: ["global"] },
    });
    assert(result.isOk());
    expect(result.value.agents).toEqual([
      expect.objectContaining({
        sId: GLOBAL_AGENTS_SID.DUST,
        status: "disabled_by_admin",
        model: expect.objectContaining({ modelId: expect.any(String) }),
      }),
    ]);
    expect(result.value.total).toBe(1);

    await upsertGlobalAgentSettings(auth, {
      agentId: GLOBAL_AGENTS_SID.DUST,
      status: "active",
    });
    const enabled = await searchAgents(auth, {
      searchTerm: "",
      filters: { scope: ["global"] },
    });
    assert(enabled.isOk());
    expect(enabled.value.agents[0].status).toBe("active");
    expect(await searchAgentIds(auth)).toEqual([
      "custom",
      GLOBAL_AGENTS_SID.DUST,
    ]);
  });

  it("preserves global audience restrictions in global-only searches", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    mockHits([
      makeDocument({
        workspace_id: GLOBAL_AGENTS_WORKSPACE_ID,
        agent_id: GLOBAL_AGENTS_SID.ANALYST,
        scope: "global",
      }),
      makeDocument({
        workspace_id: GLOBAL_AGENTS_WORKSPACE_ID,
        agent_id: GLOBAL_AGENTS_SID.HELPER,
        scope: "global",
      }),
    ]);
    expect(
      await searchAgentIds(auth, { filters: { scope: ["global"] } })
    ).toEqual([GLOBAL_AGENTS_SID.HELPER]);
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

describe("resolveAgentIdByName", () => {
  beforeEach(() => {
    mockSearch.mockReset();
  });

  it("resolves the Dust aliases and rejects blank names", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });

    expect(await resolveAgentIdByName(auth, " Dust Agent ")).toBe(
      GLOBAL_AGENTS_SID.DUST
    );
    expect(await resolveAgentIdByName(auth, "dust")).toBe(
      GLOBAL_AGENTS_SID.DUST
    );
    expect(await resolveAgentIdByName(auth, "   ")).toBeNull();
  });

  it("does not resolve the Dust aliases when an admin disabled Dust", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    await upsertGlobalAgentSettings(auth, {
      agentId: GLOBAL_AGENTS_SID.DUST,
      status: "disabled_by_admin",
    });

    expect(await resolveAgentIdByName(auth, "dust")).toBeNull();
  });

  it("resolves a custom agent by its exact name, ignoring case, without searching", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Sales Helper",
    });

    expect(await resolveAgentIdByName(auth, " sales helper ")).toBe(agent.sId);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("resolves a global agent by its name", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    const helper = await AgentResource.fetchById(
      auth,
      GLOBAL_AGENTS_SID.HELPER
    );
    assert(helper);

    expect(await resolveAgentIdByName(auth, helper.name.toUpperCase())).toBe(
      GLOBAL_AGENTS_SID.HELPER
    );
  });

  it("does not guess from a partial name", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "user" });
    await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Marketing Sales",
    });

    expect(await resolveAgentIdByName(auth, "sales")).toBeNull();
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("does not resolve an exact name the caller cannot read", async () => {
    const { authenticator: adminAuth, workspace } = await createResourceTest({
      role: "admin",
    });
    const { agentOwnerAuth } = await setupAgentOwner(workspace, "user");
    await AgentConfigurationFactory.createTestAgent(agentOwnerAuth, {
      name: "Private Helper",
      scope: "hidden",
    });

    expect(await resolveAgentIdByName(adminAuth, "Private Helper")).toBeNull();
  });
});
